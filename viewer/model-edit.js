/** Destructive edit planning for the current in-memory model only.
 * A parent with its visibility checkbox off removes its entire subtree.
 * When the root checkbox is off, its children are removed, never the root.
 * This is independent of Three.js for deterministic regression tests.
 */
export function uncheckedRoots(root, hidden) {
 if (!root) return [];
 const result=[];
 const visit=(object, inherited=false)=>{
  const excluded=inherited || hidden.has(object) || object.visible===false;
  if (object===root) {
   for(const child of object.children||[]) visit(child,excluded);
  } else if(excluded) {
   result.push(object);
  } else {
   for(const child of object.children||[]) visit(child,false);
  }
 };
 visit(root);
 return result;
}

export function countMeshes(roots) {
 let total=0;
 for(const root of roots) {
  root.traverse(obj=>{ if(obj.isMesh) total++; });
 }
 return total;
}
