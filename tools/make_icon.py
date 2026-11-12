"""Generate a small multiresolution SCN Viewer Windows icon with stdlib only."""
from pathlib import Path
import math
import struct


def line_distance(x, y, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((x - ax)*vx + (y - ay)*vy)/(vx*vx + vy*vy)))
    return math.hypot(x - (ax + t*vx), y - (ay + t*vy))


def inside_polygon(x, y, polygon):
    inside = False
    previous = polygon[-1]
    for point in polygon:
        ax, ay = previous
        bx, by = point
        if (ay > y) != (by > y) and x < (bx - ax)*(y - ay)/(by - ay) + ax:
            inside = not inside
        previous = point
    return inside


def pixel(x, y):
    # Design is scaled to the 256 x 256 artboard in the source SVG-style layout.
    if 13 <= x <= 243 and 13 <= y <= 243:
        r = 50
        corner = (13+r if x < 13+r else 243-r if x > 243-r else x,
                  13+r if y < 13+r else 243-r if y > 243-r else y)
        if math.hypot(x-corner[0],y-corner[1]) <= r:
            color = (18, 30, 49, 255)
        else:
            return (0, 0, 0, 0)
    else:
        return (0, 0, 0, 0)
    faces = [
        ([(68,78),(139,46),(204,79),(134,111)], (30,121,147,255)),
        ([(68,78),(134,111),(134,185),(68,149)], (18,82,116,255)),
        ([(134,111),(204,79),(204,152),(134,185)], (25,97,130,255)),
    ]
    for poly, shade in faces:
        if inside_polygon(x,y,poly): color=shade
    edges=[((68,78),(134,111)),((134,111),(204,79)),((134,111),(134,185)),
           ((68,78),(68,149)),((68,149),(134,185)),((134,185),(204,152)),((204,152),(204,79))]
    if any(line_distance(x,y,*a,*b)<3.5 for a,b in edges): color=(129,222,237,255)
    ruler=[((59,200),(196,200)),((59,188),(59,213)),((196,188),(196,213))]
    if any(line_distance(x,y,*a,*b)<3 for a,b in ruler): color=(251,194,88,255)
    return color


def image_data(size):
    # 32-bit BMP DIB inside an ICO, with AND mask for transparent background.
    xor = bytearray()
    mask = bytearray()
    mask_row_bytes = ((size+31)//32)*4
    for iy in range(size-1, -1, -1):
        mask_row=bytearray(mask_row_bytes)
        for ix in range(size):
            red,green,blue,alpha=pixel((ix+0.5)*256/size,(iy+0.5)*256/size)
            xor.extend((blue,green,red,alpha))
            if alpha == 0:
                mask_row[ix//8] |= (0x80 >> (ix%8))
        mask.extend(mask_row)
    header=struct.pack('<IiiHHIIiiII',40,size,size*2,1,32,0,len(xor),0,0,0,0)
    return header+bytes(xor)+bytes(mask)


def main():
    sizes=(16,32,48,64)
    images=[image_data(size) for size in sizes]
    offset=6+16*len(sizes)
    header=struct.pack('<HHH',0,1,len(sizes))
    directory=bytearray()
    for size, blob in zip(sizes,images):
        directory.extend(struct.pack('<BBBBHHII',size,size,0,0,1,32,len(blob),offset))
        offset+=len(blob)
    destination=Path(__file__).resolve().parent.parent/'installer'/'SCNViewer.ico'
    destination.write_bytes(header+directory+b''.join(images))
    print(f'Icon generated: {destination.name} ({destination.stat().st_size} bytes)')

if __name__=='__main__': main()
