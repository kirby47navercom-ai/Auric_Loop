// Shared by the editor, source-reference reader and atomic project writer.
// Keep the serialized typeLibraries key for existing Blueprint documents.
export const nativeTypeAssetSuffix=Object.freeze({typelibrary:'.hbtypes.json',enumasset:'.hbenum.json',structasset:'.hbstruct.json'});
export const isNativeTypeAssetKind=kind=>Object.hasOwn(nativeTypeAssetSuffix,kind);
export const nativeTypeAssetKind=name=>typeof name==='string'?Object.entries(nativeTypeAssetSuffix).find(([,suffix])=>name.endsWith(suffix))?.[0]||null:null;
export const isNativeTypeAssetPath=name=>nativeTypeAssetKind(name)!==null;
export const nativeTypeDeclarationContract=Object.freeze({
 owner:'prototype/native-type-assets.js',
 kinds:Object.freeze(['typelibrary','enumasset','structasset']),
 suffixes:nativeTypeAssetSuffix,
 primary:'Individual assets carry primary:{kind:enum|struct,id}; the referenced definition and its durable IDs remain stable after save. Helpers in the same file can supply nested record/enum fields.',
 authoring:'Content Browser create/filter/open, existing per-document patch/history/save; generated UUID header and consumer migration use the same atomic journal and plan CAS.',
 blueprint:'Explicit native.typeLibraries import paths for all three kinds; ordinary enum/record variables, arrays, Make/Break/SetMembers and native metadata readers.',
 cpp:'Include compileNativeTypeAsset(data).path without Source/; one shared C++ definition, no generated duplicate class or runtime type cache.',
 move:'Same-kind path/folder rename retains IDs/namespace/header path; opened references remap typeLibraries and disk references resolve project redirects.',
 dependencies:'Optional imports paths resolve cross-asset enum/record typeId fields; transitive validation, generated includes and additive defaults share atomic save/Undo.',
 remaining:Object.freeze(['Project-global automatic discovery','Destructive declaration changes and ABI hot reload'])
});
