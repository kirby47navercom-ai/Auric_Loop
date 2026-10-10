import {valid2DAsset} from './two-d-assets.js';
import {Vector3,Quaternion,Euler} from 'three';
import {componentDefaultValues,objectComponents,enabledComponent,validComponentProperties} from './scene-components.js';
import {sceneWorldMatrix,sceneWorldPosition,setSceneWorldPosition} from './scene-runtime.js';
import {geometryColliderTypes,geometryDescriptor,colliderGeometryRadius,geometryContract} from './collision-geometry.js';

export const colliderTypes=new Set(['BoxCollider','SphereCollider','CapsuleCollider','BoxCollider2D','CircleCollider2D','CapsuleCollider2D',...geometryColliderTypes]);
export const physicsQueryKeys=new Set(['physicsRaycast','physicsRaycastAll','physicsSphereCast','physicsBoxCast','physicsOverlapSphere','physicsOverlapBox','physicsClosestPoint']);
export const physicsContract={backend:'rapier',version:'0.21.0',dimensions:[2,3],geometry:geometryContract,units:{distance:'m',mass:'kg',transformRotation:'degree',jointAngle:'degree',jointAngularSpeed:'degree/s',angularVelocity:'rad/s',force:'N',torque:'N*m'},forceModes:['force','acceleration','impulse','velocityChange'],massBehavior:'automatic density mass with active shapes; configured mass without colliders; no shape-free inertia editing',queryKeys:[...physicsQueryKeys],queryDefaults:{dimension:3,mask:-1,includeTriggers:false,ignore:null},queryBehavior:{geometry:'exact primitive, convex/triangle mesh, concave 2D polygons and open edges',algorithm:'linear collider candidates, exact narrow phase',results:'HitResult or HitResult[]; overlaps deduplicate actor IDs',closestPointNormal:[0,0,0],teleports:'visible before next step',crossDimension:false},limits:{collidersPerDimension:null,querySnapshotColliders:null,querySnapshotObjects:null,jointsPerDimension:null,queryResults:null,cppQueriesPerCall:128,cppQueryBytes:4000000},cpp:{queries:'synchronous read-only world, current C++ transforms/collision flags',writes:'queued and applied by VM after function returns'},jointAxes:'positive relative owner movement; 2D Z rotation, XY translation',jointLimitations:['slider requires aligned local body frames','2D ball is an unconstrained revolute joint','no break force, plasticity, multi-body articulation or generic 6-DOF UI']};
const copy=structuredClone,rad=Math.PI/180,vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const xyz=v=>({x:v[0],y:v[1],z:v[2]}),array=v=>[v.x,v.y,v.z??0],emptyHit=()=>({hit:false,position:[0,0,0],normal:[0,0,0],actor:null});
const qValue=q=>({x:q.x,y:q.y,z:q.z,w:q.w});
const pose=(object,objects)=>{const position=new Vector3(),rotation=new Quaternion(),scale=new Vector3();sceneWorldMatrix(object,objects).decompose(position,rotation,scale);return {position,rotation,scale};};
let libraries;
export function loadPhysicsLibraries(){
  return libraries??=Promise.all([import('../node_modules/@dimforge/rapier2d-compat/dist/rapier.mjs'),import('../node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs')]).then(async modules=>{await Promise.all(modules.map(m=>m.init()));return modules.map(m=>m.default);}).catch(error=>{libraries=null;throw error;});
}

// Each dimension has its own narrow phase and solver. Object IDs remain shared
// with the editor, VM and C++ world; a collider never crosses dimensions.
export function createRigidPhysics(objects,options={}){
  const dt=options.fixedStep??options.fixedDeltaTime??1/60,maxSubsteps=options.maxSubsteps??8,gravity=options.gravity??[0,-9.81,0];
  if(!vector(gravity)||!Number.isFinite(dt)||dt<=0||dt>1||!Number.isInteger(maxSubsteps)||maxSubsteps<1||maxSubsteps>128)throw Error('물리 설정을 확인하세요.');
  const rootMotions=new Map(),rootDriven=new Set();const spaces=new Map(),materials=new Map(options.materials||[]),inputs=new Map(),keys=new Map(),jumps=new Set();
  let readyPromise,disposed=false,accumulator=0,elapsed=0,lastContacts=[],nonce=0,writingBatch=false;
  const alive=()=>{if(disposed)throw Error('종료된 물리 월드예요.');};
  const properties=(o,dim)=>{
    const type=dim===2?'Rigidbody2D':'Rigidbody',movement=enabledComponent(o,dim===2?'CharacterMovement2D':'CharacterMovement');
    const rb=enabledComponent(o,type),other=enabledComponent(o,dim===2?'Rigidbody':'Rigidbody2D');
    if(rb&&other)throw Error(o.name+': 한 오브젝트에는 한 차원의 Rigidbody만 사용할 수 있어요.');
    if(rb)return {...rb,movement};
    return movement?{...componentDefaultValues(type),movement}:null;
  };
  const typeOf=p=>options.queryOnly||!p?'static':p.isKinematic?'kinematic':p.bodyType||'dynamic';
  const record=(o,dim)=>spaces.get(dim)?.bodies.get(o.id);
  const constrained=(r,v,angular=false)=>v.map((value,i)=>(angular?(r.p?.movement?[1,1,1]:r.p?.freezeRotation)?.[i]||r.dim===2&&i!==2:r.p?.freezePosition?.[i]||r.dim===2&&i===2)?0:value);
  const dynamic=o=>{alive();if(!writingBatch)sync();const r=record(o,2)?.p?record(o,2):record(o,3);if(!r?.p||!r.body.isDynamic())throw Error('활성화된 동적 Rigidbody가 필요해요.');return r;};
  const mirror=r=>{
    if(options.queryOnly)return;
    const velocity=array(r.body.linvel()),angular=r.dim===2?[0,0,r.body.angvel()]:array(r.body.angvel());
    if(r.p){r.object.velocity=velocity;r.object.angularVelocity=angular;r.lastVelocity=JSON.stringify(velocity);r.lastAngular=JSON.stringify(angular);r.object.gameplayDebug={...r.object.gameplayDebug,physics:{dimension:r.dim,bodyType:typeOf(r.p),mass:r.body.mass(),sleeping:r.body.isSleeping(),velocity,angularVelocity:angular,ccd:r.body.isCcdEnabled(),colliders:r.colliders.size}};}
  };
  const coefficients=(p,R)=>{const merged={...p,...materials.get(p.physicalMaterial)};return {...merged,frictionCombine:R.CoefficientCombineRule[{average:'Average',min:'Min',max:'Max',multiply:'Multiply'}[merged.frictionCombine]||'Average']};};
  function shape(component,scale,R,dim){
    const p={...componentDefaultValues(component.type),...component.properties},s=scale.toArray().map(Math.abs);
    if(geometryColliderTypes.has(component.type))return geometryDescriptor(component.type,p,s,R);
    if(component.type.includes('Sphere')||component.type.includes('Circle'))return R.ColliderDesc.ball(p.radius*Math.max(...s.slice(0,dim)));
    if(component.type.startsWith('Capsule')){const radius=p.radius*(dim===2?s[0]:Math.max(s[0],s[2]));return R.ColliderDesc.capsule(Math.max(0,p.height*s[1]/2-radius),radius);}
    return dim===2?R.ColliderDesc.cuboid(p.extent[0]*s[0],p.extent[1]*s[1]):R.ColliderDesc.cuboid(...p.extent.map((v,i)=>v*s[i]));
  }
  function setPose(r,p,kinematic=false){
    const rotation=r.dim===2?new Euler().setFromQuaternion(p.rotation).z:qValue(p.rotation),position=xyz(p.position.toArray());
    if(kinematic){r.body.setNextKinematicTranslation(position);r.body.setNextKinematicRotation(rotation);}
    else{r.body.setTranslation(position,true);r.body.setRotation(rotation,true);}
  }
  function sync(){
    alive();if(!spaces.size)return;
    for(const [dim,space] of spaces){
      const {R,world}=space,active=new Set();
      for(const o of objects){
        if(['component','widget'].includes(o.kind)||o.poolActive===false)continue;
        const p=properties(o,dim),components=[...objectComponents(o),...(o.tileColliders||[])].filter(c=>colliderTypes.has(c.type)&&c.type.endsWith('2D')===(dim===2)&&c.properties?.enabled!==false&&c.properties?.collisionMode!=='none'&&o.collisionEnabled!==false);
        if(!p&&!components.length)continue;active.add(o.id);
        let r=space.bodies.get(o.id);const root=!o.parentId&&!o.parent,cached=root&&r?.poseInput?.every((v,i)=>v===(i<3?o.position[i]:i<6?o.rotation[i-3]:o.scale[i-6])),transform=cached?r.pose:pose(o,objects),transformKey=cached?r.poseKey:JSON.stringify([transform.position.toArray(),transform.rotation.toArray()]);
        if(!r){const desc=R.RigidBodyDesc.fixed();r={object:o,p,body:world.createRigidBody(desc),colliders:new Map(),dim,nonce:++nonce};space.bodies.set(o.id,r);setPose(r,transform);r.lastPose=transformKey;}
        // Root scalar comparison also catches in-place C++/script edits. Parented
        // actors still resolve the hierarchy on every sync, including parent motion.
        if(!cached){r.pose=transform;r.poseKey=transformKey;r.poseInput=root?[...o.position,...o.rotation,...o.scale]:null;}
        r.object=o;r.p=p;
        const kind=typeOf(p),bodyType={static:R.RigidBodyType.Fixed,dynamic:R.RigidBodyType.Dynamic,kinematic:R.RigidBodyType.KinematicPositionBased}[kind];
        if(r.body.bodyType()!==bodyType)r.body.setBodyType(bodyType,true);
        if(transformKey!==r.lastPose){setPose(r,transform,kind==='kinematic'&&!options.queryOnly);r.lastPose=transformKey;}
        const configuration=JSON.stringify(p);
        if(configuration!==r.configuration){
          r.body.setLinearDamping(p?.drag??0);r.body.setAngularDamping(p?.angularDrag??.05);
          r.body.setGravityScale(p?.movement?.movementMode==='flying'?0:p?.useGravity?(p.gravityScale??1)*(p.movement&&gravity[1]?p.movement.gravity/Math.abs(gravity[1]):1):0,true);r.body.enableCcd(p?.collisionDetection==='continuous');
          const freeze=p?.freezePosition??[0,0,0];if(dim===2)r.body.setEnabledTranslations(!freeze[0],!freeze[1],true);else r.body.setEnabledTranslations(...freeze.map(v=>!v),true);
          const rotations=p?.movement?[1,1,1]:p?.freezeRotation??[0,0,0];if(dim===2)r.body.lockRotations(!!rotations[2],true);else r.body.setEnabledRotations(...rotations.map(v=>!v),true);
          r.configuration=configuration;r.massDirty=true;
        }
        const activeColliders=new Set();
        for(const component of components){
          const cp={...componentDefaultValues(component.type),...component.properties},signature=JSON.stringify([cp,transform.scale.toArray(),materials.get(cp.physicalMaterial)]);activeColliders.add(component.id);
          if(p&&!p.isKinematic&&(p.bodyType||'dynamic')==='dynamic'&&(component.type==='EdgeCollider2D'||component.type==='MeshCollider'&&cp.mode==='mesh'))throw Error(o.name+': 동적 강체에는 볼록 메시 또는 다각형 충돌을 사용하세요.');
          let c=r.colliders.get(component.id);
          if(c?.signature===signature){c.object=o;c.component=component;continue;}
          if(c){space.colliders.delete(c.collider.handle);world.removeCollider(c.collider,true);}
          const material=coefficients(cp,R),desc=shape(component,transform.scale,R,dim),center=cp.center.map((v,i)=>v*transform.scale.getComponent(i));
          desc.setTranslation(...center.slice(0,dim)).setSensor(cp.trigger||cp.collisionMode==='query').setFriction(material.friction).setRestitution(material.restitution);
          desc.setFrictionCombineRule(material.frictionCombine).setRestitutionCombineRule(R.CoefficientCombineRule[{average:'Average',min:'Min',max:'Max',multiply:'Multiply'}[material.restitutionCombine]||'Average']);
          desc.setDensity(p?.autoMass?(material.density??1):1);
          desc.setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS|R.ActiveHooks.FILTER_INTERSECTION_PAIRS).setActiveCollisionTypes(R.ActiveCollisionTypes.ALL);
          c={object:o,component,p:cp,signature,collider:world.createCollider(desc,r.body),is2D:dim===2,radius:geometryColliderTypes.has(component.type)?colliderGeometryRadius(component.type,cp,transform.scale.toArray().map(Math.abs)):null};r.colliders.set(component.id,c);space.colliders.set(c.collider.handle,c);r.massDirty=true;
        }
        for(const [id,c] of r.colliders)if(!activeColliders.has(id)){space.colliders.delete(c.collider.handle);world.removeCollider(c.collider,true);r.colliders.delete(id);r.massDirty=true;}
        if(r.massDirty&&p){
          for(const c of r.colliders.values())c.collider.setDensity(p.autoMass?(coefficients(c.p,R).density??1):1);
          r.body.setAdditionalMass(0,true);r.body.recomputeMassPropertiesFromColliders();
          if(!p.autoMass||!r.colliders.size){const mass=r.body.mass();if(mass>0)for(const c of r.colliders.values())c.collider.setDensity(p.mass/mass);else r.body.setAdditionalMass(p.mass,true);r.body.recomputeMassPropertiesFromColliders();}
          r.massDirty=false;
        }
        if(p&&!options.queryOnly){
          o.velocity??=copy(p.velocity);o.angularVelocity??=copy(p.angularVelocity??[0,0,0]);
          const velocity=constrained(r,o.velocity),angular=constrained(r,o.angularVelocity,true);
          if(JSON.stringify(velocity)!==r.lastVelocity){r.body.setLinvel(xyz(velocity),true);r.lastVelocity=JSON.stringify(velocity);}
          if(JSON.stringify(angular)!==r.lastAngular){r.body.setAngvel(dim===2?angular[2]:xyz(angular),true);r.lastAngular=JSON.stringify(angular);}
        }
      }
      for(const [id,r] of space.bodies)if(!active.has(id)){for(const c of r.colliders.values())space.colliders.delete(c.collider.handle);world.removeRigidBody(r.body);space.bodies.delete(id);}
      world.propagateModifiedBodyPositionsToColliders();if(!options.queryOnly)syncJoints(space,dim);for(const r of space.bodies.values())mirror(r);
    }
  }
  function syncJoints(space,dim){
    const {R,world}=space,active=new Set();
    for(const o of objects)for(const component of objectComponents(o).filter(c=>c.type===(dim===2?'PhysicsConstraint2D':'PhysicsConstraint')&&c.properties?.enabled!==false)){
      const p={...componentDefaultValues(component.type),...component.properties},a=space.bodies.get(o.id),b=p.connectedBody?space.bodies.get(p.connectedBody):null,key=o.id+':'+component.id;
      if(!a||p.connectedBody&&!b)continue;
      if(a===b)throw Error('관절을 자기 자신에게 연결할 수 없어요.');
      active.add(key);const signature=JSON.stringify([p,a.nonce,b?.nonce]);const previous=space.joints.get(key);if(previous?.signature===signature&&previous.joint.isValid())continue;
      if(previous?.joint.isValid())world.removeImpulseJoint(previous.joint,true);
      const pa=pose(o,objects),pb=b?pose(b.object,objects):{position:new Vector3(),rotation:new Quaternion(),scale:new Vector3(1,1,1)},anchorA=new Vector3(...p.anchor).multiply(pa.scale),worldAnchor=anchorA.clone().applyQuaternion(pa.rotation).add(pa.position),anchorB=p.autoConnectedAnchor?worldAnchor.clone().sub(pb.position).applyQuaternion(pb.rotation.clone().invert()):new Vector3(...p.connectedAnchor).multiply(pb.scale);
      const vA=xyz(anchorA.toArray()),vB=xyz(anchorB.toArray()),axis=new Vector3(...p.axis).normalize(),relative=pb.rotation.clone().invert().multiply(pa.rotation);
      let data;
      if(p.jointType==='fixed')data=R.JointData.fixed(vA,dim===2?0:qValue(new Quaternion()),vB,dim===2?new Euler().setFromQuaternion(relative).z:qValue(relative));
      else if(p.jointType==='hinge')data=dim===2?R.JointData.revolute(vA,vB):R.JointData.revoluteWithAxes(vA,vB,xyz(axis.toArray()),xyz(axis.clone().applyQuaternion(relative).toArray()));
      else if(p.jointType==='slider')data=R.JointData.prismatic(vA,vB,xyz(axis.toArray()));
      else if(p.jointType==='spring')data=R.JointData.spring(p.distance,p.stiffness,p.damping,vA,vB);
      else if(p.jointType==='rope')data=R.JointData.rope(p.distance,vA,vB);
      else if(p.jointType==='ball')data=dim===2?R.JointData.revolute(vA,vB):R.JointData.spherical(vA,vB);
      else throw Error('지원하지 않는 관절 형식이에요.');
      const joint=world.createImpulseJoint(data,a.body,b?.body||space.anchorBody,true);joint.setContactsEnabled(p.enableCollision);
      const factor=p.jointType==='hinge'?rad:1;
      // Rapier measures body 2 relative to body 1. Expose owner-positive axes.
      if(p.enableLimit&&joint.setLimits)joint.setLimits(-p.upperLimit*factor,-p.lowerLimit*factor);
      if(p.useMotor&&joint.configureMotor)joint.configureMotor(-p.motorPosition*factor,-p.motorVelocity*factor,p.motorStiffness,p.motorDamping);
      space.joints.set(key,{signature,joint,object:o,component});
    }
    for(const [key,j] of space.joints)if(!active.has(key)||!j.joint.isValid()){if(j.joint.isValid())world.removeImpulseJoint(j.joint,true);space.joints.delete(key);}
  }
  const pairAllowed=(space,a,b)=>{const x=space.colliders.get(a),y=space.colliders.get(b);return !!x&&!!y&&x.object!==y.object&&((x.p.mask>>>0)&(1<<y.p.layer))!==0&&((y.p.mask>>>0)&(1<<x.p.layer))!==0&&!(x.p.collisionMode==='query'&&y.p.collisionMode==='physics'||y.p.collisionMode==='query'&&x.p.collisionMode==='physics');};
  function fixedContacts(space,dim){
    // Rapier skips fixed/fixed event pairs. Preserve editor-authored static
    // trigger/hit events with cached exact tests, using a conservative sweep.
    const fixed=[...space.colliders.values()].filter(c=>c.collider.parent().isFixed()),signature=JSON.stringify(fixed.map(c=>[c.collider.handle,c.signature,array(c.collider.translation()),c.collider.rotation()]));
    if(signature===space.fixedSignature)return space.fixedContacts;space.fixedSignature=signature;
    const bounds=fixed.map(c=>{const p=c.collider.translation(),shape=c.collider.shape,radius=c.radius??(shape.radius!==undefined?shape.radius+(shape.halfHeight||0):Math.hypot(...array(shape.halfExtents).slice(0,dim)));return {c,position:array(p),radius,min:p.x-radius,max:p.x+radius};}).sort((a,b)=>a.min-b.min),contacts=[];
    for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length&&bounds[j].min<=bounds[i].max;j++){
      const a=bounds[i],b=bounds[j],c=a.c,d=b.c;if(!pairAllowed(space,c.collider.handle,d.collider.handle)||Math.hypot(...a.position.slice(0,dim).map((v,k)=>v-b.position[k]))>a.radius+b.radius)continue;
      const hit=c.collider.contactCollider(d.collider,0);if(!hit||hit.distance>0)continue;
      contacts.push({a:c.object.id,b:d.object.id,componentA:c.component.id,componentB:d.component.id,colliderA:c,colliderB:d,trigger:c.collider.isSensor()||d.collider.isSensor(),normal:array(hit.normal1).map(v=>-v),position:array(hit.point1),penetration:-hit.distance});
    }space.fixedContacts=contacts;return contacts;
  }
  function collectContacts(){
    const result=new Map();
    for(const [dim,space] of spaces)for(const c of space.colliders.values()){
      const add=(other,trigger)=>{const d=space.colliders.get(other.handle);if(!d||!pairAllowed(space,c.collider.handle,d.collider.handle))return;const ids=[c.object.id,c.component.id,d.object.id,d.component.id],key=dim+':'+JSON.stringify(JSON.stringify(ids.slice(0,2))<JSON.stringify(ids.slice(2))?ids:[ids[2],ids[3],ids[0],ids[1]]);if(result.has(key))return;
        const otherPosition=array(d.collider.translation());let normal=[0,0,0],position=array(c.collider.translation()).map((v,i)=>(v+otherPosition[i])/2),penetration=0,contact=false;
        if(trigger)contact=space.world.intersectionPair(c.collider,d.collider);
        else space.world.contactPair(c.collider,d.collider,(manifold,flipped)=>{if(!manifold.numContacts())return;contact=true;normal=array(manifold.normal()).map(v=>v*(flipped?1:-1));penetration=Math.max(penetration,...Array.from({length:manifold.numContacts()},(_,i)=>-manifold.contactDist(i)));if(manifold.numSolverContacts())position=array(manifold.solverContactPoint(0));});
        if(contact)result.set(key,{a:c.object.id,b:d.object.id,componentA:c.component.id,componentB:d.component.id,colliderA:c,colliderB:d,trigger,normal,position,penetration:Math.max(0,penetration)});
      };
      space.world.contactPairsWith(c.collider,other=>add(other,false));space.world.intersectionPairsWith(c.collider,other=>add(other,true));
    }
    lastContacts=[...result.values(),...[...spaces].flatMap(([dim,space])=>fixedContacts(space,dim))];for(const o of objects)o.grounded=false;for(const c of lastContacts)if(!c.trigger){const a=c.colliderA.object,b=c.colliderB.object;if(c.normal[1]>.5)a.grounded=true;if(c.normal[1]<-.5)b.grounded=true;}
  }
  function updateObjects(){
    const records=[...spaces.values()].flatMap(s=>[...s.bodies.values()]).filter(r=>r.p);
    const depth=o=>{let n=0,at=o;while(at.parent||at.parentId){at=objects.find(v=>v.id===(at.parentId||at.parent));if(!at)break;if(++n>64)throw Error('부모 계층 깊이 제한 초과');}return n;};records.sort((a,b)=>depth(a.object)-depth(b.object));
    for(const r of records){const parent=(r.object.parentId||r.object.parent)?objects.find(o=>o.id===(r.object.parentId||r.object.parent)):null,parentKey=parent?sceneWorldMatrix(parent,objects).elements.join():null,sleeping=r.body.isFixed()||r.body.isSleeping();if(sleeping&&parentKey===r.lastParentKey){if(!r.lastSleeping)mirror(r);r.lastSleeping=true;continue;}r.lastSleeping=sleeping;r.lastParentKey=parentKey;const position=array(r.body.translation());if(r.dim===2)position[2]=sceneWorldPosition(r.object,objects)[2];setSceneWorldPosition(r.object,position,objects);
      const rotation=r.dim===2?new Quaternion().setFromAxisAngle(new Vector3(0,0,1),r.body.rotation()):new Quaternion().copy(r.body.rotation());
      if(parent)rotation.premultiply(pose(parent,objects).rotation.invert());r.object.rotation=new Euler().setFromQuaternion(rotation).toArray().slice(0,3).map(v=>v/rad);
      const p=pose(r.object,objects);r.lastPose=JSON.stringify([p.position.toArray(),p.rotation.toArray()]);mirror(r);options.update?.(r.object);
    }
  }
  function rootMotionStep(step){
    let changed=false;rootDriven.clear();
    for(const [o,state] of rootMotions){
      if(!objects.includes(o)||o.poolActive===false||o.destroying){rootMotions.delete(o);continue;}
      const r=record(o,2)?.p?record(o,2):record(o,3),character=enabledComponent(o,'CharacterMovement2D')||enabledComponent(o,'CharacterMovement'),top=!!enabledComponent(o,'TopDownMovement2D'),walk=character&&character.movementMode!=='flying',axes=r?.dim===2?(walk&&!top?[0]:[0,1]):walk?[0,2]:[0,1,2];rootDriven.add(o);
      const delta=new Vector3(),rotation=new Quaternion();let left=step;
      while(left>1e-9&&state.segments.length){const row=state.segments[0],take=Math.min(left,row.remaining),fraction=take/row.duration;delta.addScaledVector(row.position,fraction);rotation.multiply(new Quaternion().slerp(row.rotation,fraction));row.remaining-=take;left-=take;if(row.remaining<1e-9)state.segments.shift();}
      const amount=constrained(r||{dim:3},delta.toArray()).map((v,i)=>axes.includes(i)?v:0),euler=new Euler().setFromQuaternion(rotation);if(walk&&r?.dim!==2){euler.x=0;euler.z=0;}if(r?.dim===2){euler.x=0;euler.y=0;}if(r?.p&&!character){const angles=constrained(r,[euler.x,euler.y,euler.z],true);euler.set(...angles);}rotation.setFromEuler(euler);
      if(r?.p){
        const velocity=array(r.body.linvel());for(const i of axes)velocity[i]=amount[i]/step;
        if(r.body.isDynamic())r.body.setLinvel(xyz(constrained(r,velocity)),true);
        else if(r.body.isKinematic()){
          const space=spaces.get(r.dim);let translation=amount;if(r.p.useGravity&&!top&&character?.movementMode!=='flying')translation[1]+=(array(r.body.linvel())[1]+gravity[1]*(r.p.gravityScale??1)*(character&&gravity[1]?character.gravity/Math.abs(gravity[1]):1)*step)*step;translation=constrained(r,translation);
          const solid=[...r.colliders.values()].filter(c=>!c.collider.isSensor());
          if(solid.length){space.rootController??=space.world.createCharacterController(.001);space.world.propagateModifiedBodyPositionsToColliders();for(const c of solid){space.rootController.computeColliderMovement(c.collider,xyz(translation),undefined,undefined,other=>{const hit=space.colliders.get(other.handle);return !!hit&&!hit.p.trigger&&hit.p.collisionMode!=='query'&&pairAllowed(space,c.collider.handle,other.handle);});translation=array(space.rootController.computedMovement());}}
          r.body.setNextKinematicTranslation(xyz(array(r.body.translation()).map((v,i)=>v+translation[i])));
        }
        if(!r.body.isFixed()&&rotation.angleTo(new Quaternion())>1e-10){const before=r.dim===2?new Quaternion().setFromAxisAngle(new Vector3(0,0,1),r.body.rotation()):new Quaternion().copy(r.body.rotation()),next=rotation.multiply(before);r.body[r.body.isKinematic()?'setNextKinematicRotation':'setRotation'](r.dim===2?new Euler().setFromQuaternion(next).z:qValue(next),true);}
        if(!state.segments.length&&left===step){rootMotions.delete(o);rootDriven.delete(o);}
      }else if(r){rootMotions.delete(o);rootDriven.delete(o);}else{
        setSceneWorldPosition(o,sceneWorldPosition(o,objects).map((v,i)=>v+amount[i]),objects);const transform=pose(o,objects);transform.rotation.premultiply(rotation);const parent=objects.find(v=>v.id===(o.parentId||o.parent));if(parent)transform.rotation.premultiply(pose(parent,objects).rotation.invert());o.rotation=new Euler().setFromQuaternion(transform.rotation).toArray().slice(0,3).map(v=>v/rad);o.velocity=amount.map(v=>v/step);options.update?.(o);changed=true;if(!state.segments.length&&left===step)rootMotions.delete(o);
      }
    }return changed;
  }
  function movement(step){
    let changedPose=rootMotionStep(step);
    for(const o of objects){if(o.poolActive===false||rootDriven.has(o))continue;const move=enabledComponent(o,'TopDownMovement2D')||enabledComponent(o,'CharacterMovement2D')||enabledComponent(o,'CharacterMovement')||enabledComponent(o,'PawnMovement');if(!move)continue;
      const r=record(o,2)?.p?record(o,2):record(o,3),top=!!enabledComponent(o,'TopDownMovement2D'),controller=objects.find(v=>v.id===state.gameplay?.controller),control=controller&&enabledComponent(controller,'PlayerController'),allow=!control||control.inputEnabled,controlled=state.gameplay?.pawn===o.id||move.autoPossess;
      const keyboard=controlled&&allow?[(keys.get('d')||keys.get('arrowright')||0)-(keys.get('a')||keys.get('arrowleft')||0),top?(keys.get('w')||keys.get('arrowup')||0)-(keys.get('s')||keys.get('arrowdown')||0):0,top?0:(keys.get('s')||keys.get('arrowdown')||0)-(keys.get('w')||keys.get('arrowup')||0)]:[0,0,0],direction=o.navigationControl?.direction||new Vector3(...(inputs.get(o.id)||[0,0,0])).add(new Vector3(...keyboard)).toArray(),length=Math.hypot(...direction),target=direction.map(v=>v/Math.max(1,length)*(o.navigationControl?.speed??move.speed)),velocity=r?.p?array(r.body.linvel()):o.velocity??[0,0,0],blend=Math.min(1,move.acceleration*step);
      for(const i of top||o.navigationControl&&r?.dim===2?[0,1]:r?.dim===2?[0]:[0,2])velocity[i]+=(target[i]-velocity[i])*blend;
      if(jumps.has(o.id)&&move.jumpSpeed!==undefined&&o.grounded)velocity[1]=move.jumpSpeed;
      if(r?.body.isDynamic())r.body.setLinvel(xyz(constrained(r,velocity)),true);else if(!r?.p){setSceneWorldPosition(o,sceneWorldPosition(o,objects).map((v,i)=>v+velocity[i]*step),objects);o.velocity=velocity;options.update?.(o);changedPose=true;}
    }
    return changedPose;
  }
  function query(key,args){
    alive();sync();const dim=args.dimension??3;if(![2,3].includes(dim))throw Error('물리 질의 차원은 2 또는 3이에요.');const space=spaces.get(dim);if(!space)throw Error('물리 월드를 먼저 준비하세요.');
    if(!physicsQueryKeys.has(key))throw Error('등록되지 않은 물리 질의예요.');
    const {R}=space,mask=args.mask??-1;if(!Number.isInteger(mask)||mask< -2147483648||mask>4294967295)throw Error('질의 레이어 마스크를 확인하세요.');
    const predicate=collider=>{const c=space.colliders.get(collider.handle);return !!c&&c.p.collisionMode!=='physics'&&((mask>>>0)&(1<<c.p.layer))!==0&&(args.includeTriggers||!c.collider.isSensor())&&c.object.id!==args.ignore;};
    const checked=(v,label)=>{if(!vector(v)||v.some(x=>Math.abs(x)>1000000))throw Error(label+' 좌표를 확인하세요.');return xyz(v);};
    const size=(n,label)=>{if(!Number.isFinite(n)||n<=0||n>10000)throw Error(label+' 크기를 확인하세요.');return n;};
    // Direct collider queries use the exact narrow-phase geometry. They also
    // see teleports/BeginPlay edits before the world's next broad-phase step.
    const candidates=[...space.colliders.values()].filter(c=>predicate(c.collider));
    const hit=(h,c,start,direction)=>({hit:true,position:start.map((v,i)=>v+direction[i]*h.timeOfImpact),normal:array(h.normal),actor:c.object.id});
    if(key==='physicsRaycast'||key==='physicsRaycastAll'){
      const start=checked(args.start,'시작'),end=checked(args.end,'끝'),direction=[end.x-start.x,end.y-start.y,dim===2?0:end.z-start.z];if(!Math.hypot(...direction))return key==='physicsRaycastAll'?[]:emptyHit();
      const ray=new R.Ray(start,xyz(direction)),hits=[];for(const c of candidates){const h=c.collider.castRayAndGetNormal(ray,1,true);if(h)hits.push({...hit(h,c,args.start,direction),toi:h.timeOfImpact});}hits.sort((a,b)=>a.toi-b.toi||a.actor.localeCompare(b.actor));if(key==='physicsRaycast'){if(!hits.length)return emptyHit();const {toi,...value}=hits[0];return value;}return hits.map(({toi,...h})=>h);
    }
    if(args.rotation&&!vector(args.rotation))throw Error('질의 회전을 확인하세요.');
    const position=checked(args.center||args.point||args.start,'질의'),rotation=dim===2?(args.rotation?.[2]??0)*rad:qValue(new Quaternion().setFromEuler(new Euler(...(args.rotation||[0,0,0]).map(v=>v*rad))));
    if(key==='physicsClosestPoint'){let best;for(const c of candidates){const p=c.collider.projectPoint(position,true);if(!p)continue;const distance=Math.hypot(...array(p.point).slice(0,dim).map((v,i)=>v-array(position)[i]));if(!best||distance<best.distance)best={distance,p,c};}return best?{hit:true,position:array(best.p.point),normal:[0,0,0],actor:best.c.object.id}:emptyHit();}
    const sphere=key.includes('Sphere'),extent=args.extent||[.5,.5,.5];if(!sphere&&(!vector(extent)||extent.some(v=>v<=0||v>10000)))throw Error('상자 반 크기를 확인하세요.');
    const shape=sphere?new R.Ball(size(args.radius,'반지름')):dim===2?new R.Cuboid(extent[0],extent[1]):new R.Cuboid(...extent);
    if(key.startsWith('physicsOverlap'))return [...new Set(candidates.filter(c=>c.collider.intersectsShape(shape,position,rotation)).map(c=>c.object.id))].sort();
    const end=checked(args.end,'끝'),direction=[end.x-position.x,end.y-position.y,dim===2?0:end.z-position.z];let best;
    for(const c of candidates){const h=c.collider.castShape(xyz([0,0,0]),shape,position,rotation,xyz(direction),0,1,true);if(h&&(!best||h.time_of_impact<best.h.time_of_impact))best={h,c};}
    if(!best)return emptyHit();const {h,c}=best,rotationQ=dim===2?new Quaternion().setFromAxisAngle(new Vector3(0,0,1),c.collider.rotation()):new Quaternion().copy(c.collider.rotation());
    return {hit:true,position:new Vector3(...array(h.witness1)).applyQuaternion(rotationQ).add(new Vector3(...array(c.collider.translation()))).toArray(),normal:new Vector3(...array(h.normal1)).applyQuaternion(rotationQ).toArray(),actor:c.object.id};
  }
  const state={backend:'rapier',objects,gameplay:options.gameplay||null,
    // Only consecutive synchronous velocity/force/sleep writes share a sync.
    // Scene edits and queries remain outside this scope and synchronize normally.
    writeBatch(callback){alive();if(writingBatch)throw Error('물리 쓰기 묶음 중첩');sync();writingBatch=true;try{return callback();}finally{writingBatch=false;}},
    async ready(){alive();readyPromise??=loadPhysicsLibraries().then(modules=>{alive();for(let i=0;i<modules.length;i++){const R=modules[i],dim=i+2,world=new R.World(xyz(gravity));world.timestep=dt;world.numSolverIterations=options.solverIterations??8;const space={R,world,bodies:new Map(),colliders:new Map(),joints:new Map(),eventQueue:new R.EventQueue(true),anchorBody:world.createRigidBody(R.RigidBodyDesc.fixed())};space.hooks={filterContactPair:(a,b)=>pairAllowed(space,a,b)?R.SolverFlags.COMPUTE_IMPULSE:null,filterIntersectionPair:(a,b)=>pairAllowed(space,a,b)};spaces.set(dim,space);}sync();return state;}).catch(error=>{state.dispose();throw error;});return readyPromise;},
    async loadMaterials(read){for(const o of objects)for(const c of objectComponents(o)){const path=c.properties?.physicalMaterial;if(!path||materials.has(path))continue;const data=await read(path);if(data?.version!==1||!['friction','restitution','density'].every(k=>Number.isFinite(data[k]))||data.friction<0||data.friction>10||data.restitution<0||data.restitution>1||data.density<=0)throw Error('물리 머테리얼 검증 실패: '+path);materials.set(path,data);}return state.ready();},
    input(key,value){keys.set(key.toLowerCase(),value);if(key===' '&&value&&state.gameplay?.pawn)jumps.add(state.gameplay.pawn);},releaseInput(){keys.clear();inputs.clear();jumps.clear();},
    rootMotion(o,motion,duration){alive();if(options.queryOnly||!objects.includes(o)||o.poolActive===false)return;if(!Number.isFinite(duration)||duration<0||duration>86400||!motion||motion.length!==7||!Array.from(motion).every(Number.isFinite)||Array.from(motion.slice(0,3)).some(v=>Math.abs(v)>1000000)||Math.abs(Math.hypot(...motion.slice(3))-1)>.001)throw Error('루트 모션 이동량·시간 오류');if(!duration)return;let state=rootMotions.get(o);if(!state){state={segments:[]};rootMotions.set(o,state);}const pending=state.segments.reduce((v,s)=>v+s.remaining,0),accepted=Math.max(0,Math.min(duration,dt*maxSubsteps-pending));if(!accepted)return;const transform=pose(o,objects),position=new Vector3(...motion.slice(0,3)).multiply(transform.scale).applyQuaternion(transform.rotation),rotation=new Quaternion().fromArray(motion,3).premultiply(transform.rotation).multiply(transform.rotation.clone().invert());state.segments.push({position,rotation,duration,remaining:accepted});},
    clearRootMotion(o){if(!rootMotions.has(o))return;rootMotions.delete(o);const r=record(o,2)?.p?record(o,2):record(o,3);if(r?.body.isDynamic()){const v=array(r.body.linvel()),move=enabledComponent(o,'CharacterMovement2D')||enabledComponent(o,'CharacterMovement'),axes=r.dim===2?[0,1]:[0,1,2];for(const i of axes)if(i!==1||!move||move.movementMode==='flying'||enabledComponent(o,'TopDownMovement2D'))v[i]=0;r.body.setLinvel(xyz(v),true);}else if(!r?.p)o.velocity=[0,0,0];},
    movement(o,direction,value=1){if(!vector(direction)||!Number.isFinite(value))throw Error('이동 입력을 확인하세요.');inputs.set(o.id,new Vector3(...(inputs.get(o.id)||[0,0,0])).addScaledVector(new Vector3(...direction),value).toArray());},jump(o){jumps.add(o.id);},
    velocity(o,v){if(!vector(v))throw Error('속도를 확인하세요.');const r=dynamic(o);r.body.setLinvel(xyz(constrained(r,v)),true);mirror(r);},
    angularVelocity(o,v){if(!vector(v))throw Error('각속도를 확인하세요.');const r=dynamic(o),angular=constrained(r,v,true);r.body.setAngvel(r.dim===2?angular[2]:xyz(angular),true);mirror(r);},
    impulse(o,v){return state.applyForce(o,v,'impulse');},force(o,v){return state.applyForce(o,v,'force');},
    applyForce(o,v,mode='force',point){if(!vector(v)||point&&!vector(point)||!['force','acceleration','impulse','velocityChange'].includes(mode))throw Error('힘·모드·작용점을 확인하세요.');const r=dynamic(o),mass=['acceleration','velocityChange'].includes(mode)?r.body.mass():1,force=xyz(v.map(x=>x*mass)),impulse=['impulse','velocityChange'].includes(mode),wake=v.some(x=>x!==0);if(point)r.body[impulse?'applyImpulseAtPoint':'addForceAtPoint'](force,xyz(point),wake);else r.body[impulse?'applyImpulse':'addForce'](force,wake);mirror(r);},
    torque(o,v,impulse=false){if(!vector(v))throw Error('토크를 확인하세요.');const r=dynamic(o);r.body[impulse?'applyTorqueImpulse':'addTorque'](r.dim===2?v[2]:xyz(v),v.some(x=>x!==0));mirror(r);},
    sleeping(o,value){const r=dynamic(o);value?r.body.sleep():r.body.wakeUp();mirror(r);},
    query,contacts(){return lastContacts;},
    debug(){alive();return [...spaces].map(([dimension,s])=>{const data=s.world.debugRender();if(dimension===3)return {dimension,...data};const vertices=new Float32Array(data.vertices.length/2*3);for(let i=0;i<data.vertices.length/2;i++)vertices.set([data.vertices[i*2],data.vertices[i*2+1],0],i*3);return {dimension,vertices,colors:data.colors};});},
    inspect(){alive();sync();return {backend:'rapier',fixedStep:dt,elapsed,dimensions:[...spaces].map(([dimension,s])=>({dimension,bodies:[...s.bodies.values()].map(r=>({id:r.object.id,bodyType:typeOf(r.p),position:array(r.body.translation()),velocity:array(r.body.linvel()),angularVelocity:dimension===2?[0,0,r.body.angvel()]:array(r.body.angvel()),mass:r.body.mass(),sleeping:r.body.isSleeping(),colliders:r.colliders.size})),joints:[...s.joints.values()].map(j=>({owner:j.object.id,component:j.component.id,type:j.component.properties.jointType,connectedBody:j.component.properties.connectedBody||null}))}))};},
    step(delta,limit=maxSubsteps){alive();if(!spaces.size)throw Error('물리 월드를 먼저 준비하세요.');if(!Number.isFinite(delta)||delta<0)throw Error('물리 시간을 확인하세요.');accumulator=Math.min(accumulator+delta,dt*maxSubsteps);let count=0;
      while(accumulator+1e-9>=dt&&count<limit){sync();if(movement(dt))sync();for(const o of objects)for(const c of objectComponents(o).filter(c=>['ConstantForce','ConstantForce2D'].includes(c.type)&&c.properties?.enabled!==false)){const p={...componentDefaultValues(c.type),...c.properties},r=record(o,c.type.endsWith('2D')?2:3);if(!r?.body.isDynamic())continue;r.body.addForce(xyz(p.force),p.force.some(v=>v!==0));r.body.addTorque(r.dim===2?p.torque[2]:xyz(p.torque),p.torque.some(v=>v!==0));}
        for(const s of spaces.values())s.world.step(s.eventQueue,s.hooks);updateObjects();collectContacts();elapsed+=dt;accumulator=Math.max(0,accumulator-dt);count++;jumps.clear();
        inputs.clear();for(const s of spaces.values())for(const r of s.bodies.values())if(r.p){r.body.resetForces(false);r.body.resetTorques(false);}
      }
      if(count){inputs.clear();for(const s of spaces.values())for(const r of s.bodies.values())if(r.p){r.body.resetForces(false);r.body.resetTorques(false);}}
      if(state.gameplay){state.gameplay.elapsed=elapsed;for(const type of ['GameMode','GameState']){const o=objects.find(o=>o.id===state.gameplay[type==='GameMode'?'gameMode':'gameState']),c=o&&objectComponents(o).find(c=>c.type===type);if(c){c.properties.elapsed=elapsed;c.properties.matchState=state.gameplay.matchState;}}}return count;
    },
    async advance(delta,before,after){await state.ready();if(!Number.isFinite(delta)||delta<0)throw Error('물리 시간을 확인하세요.');accumulator=Math.min(accumulator+delta,dt*maxSubsteps);let count=0;while(accumulator+1e-9>=dt&&count<maxSubsteps){await before?.(dt);state.step(0,1);await after?.(dt);count++;}return count;},
    dispose(){if(disposed)return;disposed=true;state.releaseInput();rootMotions.clear();rootDriven.clear();for(const s of spaces.values()){if(s.rootController)s.world.removeCharacterController(s.rootController);s.world.free();s.eventQueue.free();}spaces.clear();lastContacts=[];}
  };return state;
}

export function validPhysicsSnapshot(objects){
  if(!Array.isArray(objects)||new Set(objects.map(o=>o?.id)).size!==objects.length)return false;
  const byId=new Map(objects.map(o=>[o?.id,o]));
  for(const o of objects){
    if(!o||o.runtimeTilemap!==undefined&&!valid2DAsset('tilemap',o.runtimeTilemap)||o.tilemapDirty!==undefined&&typeof o.tilemapDirty!=='boolean'||typeof o.id!=='string'||!o.id.length||o.id.length>160||!['position','rotation','scale'].every(k=>vector(o[k])&&o[k].every(v=>Math.abs(v)<=10000))||!o.scale.every(v=>v>=.01)||o.components!==undefined&&(!Array.isArray(o.components)||o.components.length>100)||o.tileColliders!==undefined&&!Array.isArray(o.tileColliders))return false;
    const components=[...(o.components||[]),...(o.tileColliders||[])];if(new Set(components.map(c=>c?.id)).size!==components.length)return false;
    for(const c of components){if(!c||typeof c.type!=='string'||typeof c.id!=='string'||!c.id.length||c.id.length>160)return false;if((colliderTypes.has(c.type)||['Rigidbody','Rigidbody2D','CharacterMovement','CharacterMovement2D'].includes(c.type))&&!validComponentProperties(c.type,c.properties||{}))return false;}
    const seen=new Set([o.id]);let parent=o.parentId||o.parent,depth=0;while(parent){if(typeof parent!=='string'||seen.has(parent)||!byId.has(parent)||++depth>64)return false;seen.add(parent);parent=byId.get(parent).parentId||byId.get(parent).parent;}
  }return true;
}
