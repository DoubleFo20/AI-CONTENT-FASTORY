"""Create required PWA PNG icons with Python's standard library, no image dependencies."""
from pathlib import Path
import struct
import zlib


def chunk(kind, payload):
    return struct.pack('!I', len(payload)) + kind + payload + struct.pack('!I', zlib.crc32(kind + payload) & 0xffffffff)


def icon(size):
    data = bytearray()
    for y in range(size):
        data.append(0)
        for x in range(size):
            nx, ny = x / size, y / size
            color = (18, 38, 56, 255)
            if 0.34 <= nx <= 0.78 and abs(ny - 0.5) <= (0.78 - nx) * 0.63:
                color = (108, 224, 198, 255)
            if (nx - 0.24) ** 2 + (ny - 0.24) ** 2 < 0.05 ** 2:
                color = (255, 255, 255, 255)
            data.extend(color)
    header = struct.pack('!2I5B', size, size, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(data)) + chunk(b'IEND', b'')


for dimension in (192, 512):
    target = Path('public') / f'icon-{dimension}.png'
    target.write_bytes(icon(dimension))
    print(f'Created {target}')
