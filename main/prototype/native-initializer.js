// Parse literal C++ aggregate initialization; never evaluate user C++ as JavaScript.
export function nativeInitializer(text,type,array=false){
  text=text.replace(/\b(?:hb::)?(?:Vec2|Vec3|Color|Transform|HitResult|Vector2|Vector3)\s*(?=\{)/g,'');
  const tokens=text.match(/"(?:\\.|[^"\\])*"|nullptr|true|false|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[fFuUlL]*|[{}\[\],]/g)||[];
  if(tokens.join('').replace(/\s/g,'')!==text.replace(/\s/g,''))throw Error('C++ 기본값에는 리터럴 초기화를 사용하세요.');
  let at=0,count=0;
  const value=depth=>{if(depth>16||++count>4096)throw Error('C++ 기본값 크기 제한');const token=tokens[at++];if(token==='{'||token==='['){const close=token==='{'?'}':']',values=[];while(tokens[at]!==close){if(at>=tokens.length)throw Error('C++ 초기화 괄호를 확인하세요.');values.push(value(depth+1));if(tokens[at]===','){at++;if(tokens[at]===close)break;}else if(tokens[at]!==close)throw Error('C++ 초기화 쉼표를 확인하세요.');}at++;return values;}if(token==='nullptr')return null;if(token==='true'||token==='false')return token==='true';if(token?.startsWith('"'))return JSON.parse(token);const number=Number(token?.replace(/[fFuUlL]+$/,''));if(!Number.isFinite(number))throw Error('C++ 기본 숫자를 확인하세요.');return number;};
  const parsed=value(0);if(at!==tokens.length)throw Error('C++ 기본값 뒤에 불필요한 표현식이 있어요.');
  const aggregate=(v,type)=>{if(!['vec2','vec3','color','transform','hit'].includes(type)&&Array.isArray(v)&&v.length===1)v=v[0];if(type==='transform'&&Array.isArray(v))return {position:v[0]||[0,0,0],rotation:v[1]||[0,0,0],scale:v[2]||[1,1,1]};if(type==='hit'&&Array.isArray(v))return {hit:v[0]??false,position:v[1]||[0,0,0],normal:v[2]||[0,0,0],actor:v[3]??null};if(['vec2','vec3','color'].includes(type)&&Array.isArray(v)){const n={vec2:2,vec3:3,color:4}[type];return Array.from({length:n},(_,i)=>v[i]??(type==='color'?1:0));}return v;};
  return array?(Array.isArray(parsed)?parsed.map(v=>aggregate(v,type)):parsed):aggregate(parsed,type);
}
