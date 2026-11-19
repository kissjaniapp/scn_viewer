"""Generate the multiresolution JOB Viewer Windows icon with stdlib only."""
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
    # The native Windows icon follows the JOB Viewer vector brand:
    # dark rounded tile, cyan CAD cabinet, steel J and amber measure ticks.
    if not (10 <= x <= 246 and 10 <= y <= 246):
        return (0, 0, 0, 0)
    radius = 43
    cx = 10+radius if x < 10+radius else 246-radius if x > 246-radius else x
    cy = 10+radius if y < 10+radius else 246-radius if y > 246-radius else y
    distance = math.hypot(x-cx,y-cy)
    if distance > radius:
        return (0, 0, 0, 0)
    color=(12,30,46,255)
    if distance > radius - 5:
        color=(20,207,225,255)
    panel_front=[(44,65),(125,104),(125,178),(44,137)]
    panel_side=[(125,104),(202,65),(202,139),(125,178)]
    panel_top=[(44,65),(120,28),(202,65),(125,104)]
    for polygon, shade in ((panel_top,(28,85,104,255)),
                            (panel_front,(17,64,81,255)),
                            (panel_side,(190,130,69,255))):
        if inside_polygon(x,y,polygon):
            color=shade
    outlines=[
        ((44,65),(120,28)),((120,28),(202,65)),((202,65),(125,104)),
        ((125,104),(44,65)),((44,65),(44,137)),((44,137),(125,178)),
        ((125,178),(202,139)),((202,139),(202,65)),((125,104),(125,178)),
        ((58,85),(111,112)),((111,112),(111,154)),((111,154),(58,126))
    ]
    if any(line_distance(x,y,*a,*b)<2.8 for a,b in outlines):
        color=(35,228,240,255)
    # Steel J in the foreground: tall stem and curved base.
    j=[((127,71),(127,143)),((127,143),(114,157)),((114,157),(98,158)),
       ((98,158),(83,151))]
    if any(line_distance(x,y,*a,*b)<8 for a,b in j):
        color=(178,236,251,255)
    rulers=[
        ((222,76),(222,139)),((214,76),(230,76)),((214,139),(230,139)),
        ((45,193),(200,193)),((45,186),(45,202)),((200,186),(200,202))
    ]
    if any(line_distance(x,y,*a,*b)<2.8 for a,b in rulers):
        color=(255,196,72,255)
    # Small high-contrast label even at 64px.
    if 206 <= y <= 217 and 87 <= x <= 169:
        if (x//5+y//3) % 3 != 0:
            color=(228,248,253,255)
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
    sizes=(16,32,48,64,128,256)
    images=[image_data(size) for size in sizes]
    offset=6+16*len(sizes)
    header=struct.pack('<HHH',0,1,len(sizes))
    directory=bytearray()
    for size, blob in zip(sizes,images):
        directory.extend(struct.pack('<BBBBHHII',size % 256,size % 256,0,0,1,32,len(blob),offset))
        offset+=len(blob)
    destination=Path(__file__).resolve().parent.parent/'installer'/'SCNViewer.ico'
    destination.write_bytes(header+directory+b''.join(images))
    print(f'Icon generated: {destination.name} ({destination.stat().st_size} bytes)')

if __name__=='__main__': main()
