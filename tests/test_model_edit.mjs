import assert from 'node:assert/strict';
import { uncheckedRoots, countMeshes } from '../viewer/model-edit.js';

function node(name, children=[], mesh=false) {
 const obj={name,children,visible:true,isMesh:mesh,parent:null};
 obj.traverse=fn=>{fn(obj);for(const child of obj.children)child.traverse(fn);};
 for(const child of children)child.parent=obj;
 return obj;
}
// Selection reflects exactly those objects whose visibility checkbox is off;
// a checked sibling and its descendants must never be deleted.
const a=node('a',[node('a1',[],true),node('a2',[],true)]);
const b=node('b',[node('b1',[],true)]);
const c=node('c',[],true);
const root=node('root',[a,b,c]);
const hidden=new Set([a,c]);
assert.deepEqual(uncheckedRoots(root,hidden),[a,c]);
assert.equal(countMeshes(uncheckedRoots(root,hidden)),3);
assert.ok(!uncheckedRoots(root,hidden).includes(b));

// A hidden child is removable even if its parent is checked.
hidden.clear();
hidden.add(b.children[0]);
assert.deepEqual(uncheckedRoots(root,hidden),[b.children[0]]);
assert.equal(countMeshes(uncheckedRoots(root,hidden)),1);

// The document root is preserved even when its checkbox is off.
hidden.clear();
hidden.add(root);
assert.deepEqual(uncheckedRoots(root,hidden),[a,b,c]);
assert.ok(!uncheckedRoots(root,hidden).includes(root));

// A parent hidden flag takes precedence over hidden descendants.
hidden.clear();
a.visible=false;
hidden.add(a.children[0]);
assert.deepEqual(uncheckedRoots(root,hidden),[a]);
a.visible=true;
hidden.clear();
assert.deepEqual(uncheckedRoots(root,hidden),[]);
console.log('OK: unchecked model subtrees, root safety and mesh counts');
