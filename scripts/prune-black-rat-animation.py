#!/usr/bin/env python3
"""Remove only constant glTF animation channels identical to a node's bind TRS.
Keeps every varying channel and every constant channel differing from rest.
Uses Python stdlib; modifies only the explicitly supplied copy of the GLB.
"""
import json
import struct
import sys
from pathlib import Path

p=Path(sys.argv[1])
blob=p.read_bytes()
magic,version,total=struct.unpack_from('<III',blob,0)
assert magic==0x46546c67 and version==2 and total==len(blob)
jlen,jtype=struct.unpack_from('<II',blob,12)
assert jtype==0x4e4f534a
doc=json.loads(blob[20:20+jlen])
body=blob[20+jlen:]
blen,btype=struct.unpack_from('<II',body)
assert btype==0x004e4942
binary=body[8:]
default={'translation':[0,0,0], 'rotation':[0,0,0,1], 'scale':[1,1,1]}
def read_vec(accessor,offset):
    n={'SCALAR':1,'VEC3':3,'VEC4':4}[accessor['type']]
    assert accessor['componentType']==5126
    view=doc['bufferViews'][accessor['bufferView']]
    base=view.get('byteOffset',0)+accessor.get('byteOffset',0)+offset*4*n
    return struct.unpack_from('<'+'f'*n,binary,base)
def same(a,b):
    return len(a)==len(b) and max(abs(x-y) for x,y in zip(a,b))<1e-5

for anim in doc.get('animations',[]):
    before=len(anim['channels'])
    kept=[]
    for ch in anim['channels']:
        sampler=anim['samplers'][ch['sampler']]
        accessor=doc['accessors'][sampler['output']]
        remove=False
        if accessor['count']==2 and sampler.get('interpolation','LINEAR') in ('LINEAR','STEP'):
            a=read_vec(accessor,0)
            b=read_vec(accessor,1)
            target=ch['target']
            node=doc['nodes'][target['node']]
            if same(a,b) and same(a,node.get(target['path'],default[target['path']])):
                remove=True
        if not remove: kept.append(ch)
    used=sorted({ch['sampler'] for ch in kept})
    remap={old:index for index,old in enumerate(used)}
    anim['channels']=[{**ch,'sampler':remap[ch['sampler']]} for ch in kept]
    anim['samplers']=[anim['samplers'][i] for i in used]
    print(anim['name'],before,'->',len(kept),'channels',flush=True)
new=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode()
new+=b' '*((-len(new))%4)
out=struct.pack('<III',magic,version,12+8+len(new)+len(body))
out+=struct.pack('<II',len(new),jtype)+new+body
p.write_bytes(out)
print('RESULT',len(out),'bytes',flush=True)
