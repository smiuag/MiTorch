#!/usr/bin/env python3
# Genera src/assets/maritime-grid.json a partir del PNG del wiki
# (Mapa_oceano_barcos_npcs.png). One-shot: corre a mano cuando cambie la
# fuente. No entra en el bundle ni en builds normales.
#
# Uso:
#   python scripts/build-maritime-grid.py <input.png> [output.json]
#
# La paleta y la calibracion estan documentadas en NAVEGACION.md.

import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Necesitas Pillow: pip install Pillow", file=sys.stderr)
    sys.exit(1)

ORIGIN_X = 179
ORIGIN_Y = 179
PITCH = 55
WIDTH = 92
HEIGHT = 36

PALETTE = [
    (0,  (132, 113, 16),  'tierra'),
    (1,  (121,  65, 32),  'muelle'),
    (2,  (255, 239, 133), 'playa'),
    (3,  (0, 242, 233),   'costa1'),
    (4,  (0, 180, 171),   'costa2'),
    (5,  (0, 183, 237),   'oceano3'),
    (6,  (0, 139, 193),   'oceano4'),
    (7,  (0, 112, 194),   'oceano5'),
    (8,  (0,  77, 137),   'oceano6'),
    (9,  (0,  54, 137),   'oceano7'),
    (10, (0,  30,  88),   'oceano8'),
    (11, (7,   1,  63),   'oceano9'),
]

# (id, nombre legible, col, row). Confirmados por el usuario 2026-05-23.
PORTS = [
    ('sirenidos', 'Sirenidos',          4, 34),
    ('urlom',     'Urlom',             28, 20),
    ('alandaen',  'Alandaen',          36, 22),
    ('avharanna', 'Avharanna',         42, 12),
    ('veleiron',  'Veleiron',          43, 21),
    ('wigh',      'Wigh',              44, 11),
    ('grimoszk',  'Grimoszk',          47, 20),
    ('drimelan',  'Drimelan',          55, 12),
    ('aldara',    'Aldara',            56, 18),
    ('arilven',   'Arilven',           58, 13),
    ('schiphol',  'Schiphol',          59, 15),
    ('keel',      'Keel',              67, 29),
    ('bucanero',  'Isla del Bucanero', 79, 13),
    ('kamana',    'Kamana',            84,  5),
]


def classify(rgb):
    """Devuelve el id de paleta mas cercano al pixel (squared distance)."""
    best_id, best_dist = 11, float('inf')
    for pid, color, _name in PALETTE:
        d = sum((a - b) ** 2 for a, b in zip(rgb, color))
        if d < best_dist:
            best_id, best_dist = pid, d
    return best_id


def classify_cell(im, col, row):
    """Clasifica una celda muestreando una rejilla 5x5 dentro de ella,
    descartando pixels casi-blancos (texto, simbolos) y casi-negros
    (lineas de la grid, bordes). Devuelve la clase mayoritaria de los
    pixels validos. Si la celda esta tapada por texto/leyenda, cae al
    centro o al fallback de oceano profundo.
    """
    from collections import Counter
    cx = ORIGIN_X + col * PITCH
    cy = ORIGIN_Y + row * PITCH
    votes = Counter()
    for dx in (-20, -10, 0, 10, 20):
        for dy in (-20, -10, 0, 10, 20):
            x, y = cx + dx, cy + dy
            if x < 0 or y < 0 or x >= im.width or y >= im.height:
                continue
            rgb = im.getpixel((x, y))
            # Descarta casi-blanco (texto de la leyenda, etiquetas, simbolos
            # decorativos). El color mas cercano a blanco en la paleta es
            # playa, asi que sin este filtro salen falsas playas.
            if min(rgb) > 230:
                continue
            # Descarta casi-negro (bordes, lineas de la grid).
            if max(rgb) < 30:
                continue
            votes[classify(rgb)] += 1
    if not votes:
        return 11  # tapada por overlay: fallback oceano profundo
    return votes.most_common(1)[0][0]


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('maritime-source.png')
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('src/assets/maritime-grid.json')

    if not src.exists():
        print(f"PNG no encontrado: {src}", file=sys.stderr)
        sys.exit(1)

    im = Image.open(src).convert('RGB')
    print(f"Source: {src} {im.size}")

    cells = []
    for row in range(HEIGHT):
        for col in range(WIDTH):
            cx = ORIGIN_X + col * PITCH
            cy = ORIGIN_Y + row * PITCH
            if cx >= im.width or cy >= im.height:
                cells.append(11)  # fuera de la imagen: oceano profundo
                continue
            cells.append(classify_cell(im, col, row))

    # Forzar los 14 puertos confirmados como muelle, sobreescribiendo lo que
    # diga el sampling. Algunos (sirenidos, kamana) caen en pixeles playa/ocean
    # porque el cartografo no dibujo un cuadrado marron en esa celda exacta,
    # pero el usuario los usa como puertos navegables.
    for pid, _name, col, row in PORTS:
        cells[row * WIDTH + col] = 1

    # Validacion: imprimir como queda cada puerto.
    print("\nPuertos en el grid final:")
    for pid, name, col, row in PORTS:
        v = cells[row * WIDTH + col]
        tag = PALETTE[v][2]
        print(f"  {pid:10} ({col:2},{row:2}) -> {tag}")

    ports_json = [
        {'id': pid, 'name': name, 'col': col, 'row': row}
        for pid, name, col, row in PORTS
    ]

    data = {
        'width': WIDTH,
        'height': HEIGHT,
        'palette': [
            {'id': pid, 'rgb': list(color), 'name': name}
            for pid, color, name in PALETTE
        ],
        'cells': cells,
        'ports': ports_json,
    }

    dst.parent.mkdir(parents=True, exist_ok=True)
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(data, f, separators=(',', ':'), ensure_ascii=False)

    print(f"\nEscritos {WIDTH * HEIGHT} cells y {len(PORTS)} puertos a {dst}")
    print(f"Tamano: {dst.stat().st_size} bytes")


if __name__ == '__main__':
    main()
