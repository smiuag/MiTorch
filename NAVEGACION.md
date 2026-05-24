# Navegación marítima en Reinos de Leyenda

Documento de doctrina del sistema de navegación marítima. No se carga
automáticamente — léelo cuando trabajes en el `MaritimeMapService`,
`navegarsala`, el renderer del mapa de océano, o el parser de líneas
marinas.

## Sistema de coordenadas

Las salas marinas vienen con header en formato:

```
<NombreZona> [<col>º Oeste, <row>º Sur]
```

Ejemplos reales del log de referencia:

```
Costas de Anduar [37º Oeste, 23º Sur]
Mar de Hielo [55º Oeste, 29º Sur]
Muelles de Keel: Muelle Principal [67º Oeste, 29º Sur]
```

- `col` = primer número entre corchetes (Oeste). Mismo eje que `col` de
  la cuadrícula del PNG marítimo del wiki, rango ~0..91.
- `row` = segundo número (Sur). Mismo eje que `row` del PNG, rango
  ~0..35+.
- Todos los puertos confirmados están con coords Oeste/Sur. La
  posibilidad de Este/Norte existe pero no la hemos visto — tratar
  defensivamente: regex tolerante a `Este`/`Norte` y rechazar (o invertir
  signo) si aparecen.

Convención interna: usar `(col, row)` (column-major) como tupla
canónica. Coincide con la grid del PNG y con el orden del header.

## Dos modos de navegación

### Modo automático: `ruta <col> <row>`

```
> ruta 67 29
Sacas el mapa del océano y comienzas a trazar la ruta hacia la
posición 67º Oeste 29º Sur. Cuando ya lo tienes todo claro, agarras el
timón y te dispones a surcar las aguas.

Exclamas en dendrita: ¡A toda vela! ¡Rumbo a 67º Oeste 29º Sur!
```

El barco se mueve solo cell-by-cell. **El MUD elige el camino** —
incluido pasar por Costas (zonas con corrientes que ralentizan). El
mensaje `¡La fortísima corriente ralentiza terriblemente la
navegación!` aparece cuando entra en una casilla de Costa con corriente
adversa.

`ruta` es **skill con bloqueo**: `[El bloqueo 'ruta' termina]`
aparece al finalizar. Lanzar dos `ruta` seguidos no funciona — hay que
esperar a que termine la anterior o cancelarla con `navegar detener`.

Limitaciones de `ruta`:
- No permite elegir camino (pasa por costas lentas si "encajan" en
  línea recta).
- Solo va a un punto, no concatena waypoints.
- Bloquea otras skills mientras esté activa.

### Modo manual: `orientar` + `navegar` + `navegar detener`

Bucle típico:

```
> orientar sur
Agarras con fuerza el Timón y empiezas a girar hacia el sur ...
} (espera ~1-2s)
La embarcación termina de orientarse hacia el sur.

> navegar
Maniobras con el Timón para navegar en dirección sur.
Exclamas en dendrita: ¡Adelante! ...
(el barco empieza a avanzar 1 sala por tick hasta detenerlo)

Mar de Hielo [67º Oeste, 30º Sur]
Mar de Hielo [67º Oeste, 31º Sur]
...

> navegar detener
Exclamas en dendrita: ¡Alto! ¡alto! ¡detened la navegación!
La embarcación se detiene.
```

Direcciones aceptadas por `orientar`:

| Comando            | Δcol | Δrow |
|--------------------|------|------|
| `orientar norte`   |  0   | -1   |
| `orientar sur`     |  0   | +1   |
| `orientar este`    | +1   |  0   |
| `orientar oeste`   | -1   |  0   |
| `orientar noreste` | +1   | -1   |
| `orientar noroeste`| -1   | -1   |
| `orientar sudeste` | +1   | +1   |
| `orientar sudoeste`| -1   | +1   |

(Nota: como `row` crece hacia el sur — coordenadas pantalla — sur es
`+1` y norte es `-1`.)

Sincronía importante: **no se pueden encolar comandos**. Hay que
esperar a `La embarcación termina de orientarse hacia <dir>.` antes de
mandar `navegar`, y a `La embarcación se detiene.` antes de mandar el
siguiente `orientar`. Si se manda `navegar` antes del fin del giro el
MUD lo ignora o lo encola con resultados imprevisibles.

## Paleta del mapa marítimo

(Confirmada por análisis píxel del PNG `Mapa_oceano_barcos_npcs.png` del
wiki, 6600×2300, cell pitch ≈ 55 px, origin ≈ (179, 179).)

| Tipo       | RGB              | Comportamiento                           |
|------------|------------------|------------------------------------------|
| Tierra     | (132, 113, 16)   | Bloquea movimiento. Sin entrar.          |
| Muelle     | (121, 65, 32)    | Puerto navegable. Target de ruta.        |
| Playa      | (255, 239, 133)  | Accesible solo a pie (no en barco).      |
| 1 Costa    | (0, 242, 233)    | Navegable. Posibles corrientes lentas.   |
| 2 Costa    | (0, 180, 171)    | Navegable. Posibles corrientes lentas.   |
| 3 Oceano   | (0, 183, 237)    | Navegable rápido.                        |
| 4 Oceano   | (0, 139, 193)    | Navegable rápido.                        |
| 5 Oceano   | (0, 112, 194)    | Navegable rápido.                        |
| 6 Oceano   | (0, 77, 137)     | Navegable rápido.                        |
| 7 Oceano   | (0, 54, 137)     | Navegable rápido.                        |
| 8 Oceano   | (0, 30, 88)      | Navegable rápido.                        |
| 9 Oceano   | (7, 1, 63)       | Navegable rápido (la más profunda).      |

Para A*: coste por cell ≈ 1 para Oceano 3-9, ~2-3 para Costa 1-2,
∞ para Tierra. Los Muelles son destinos, no terreno de tránsito (no se
puede atravesar un muelle ajeno: hay que terminar en él).

## Puertos confirmados (al 2026-05-23)

| Puerto      | (col, row) | Salas en `map-reinos.json`                    |
|-------------|-----------:|-----------------------------------------------|
| sirenidos   | (4, 34)    | — (no exploradas)                             |
| urlom       | (28, 20)   | Bahía de Urlom: Muelle Principal              |
| alandaen    | (36, 22)   | Muelle / Puerto / Astillero de Alandaen       |
| avharanna   | (42, 12)   | Muelle de Avharanna                           |
| veleiron    | (43, 21)   | Muelles de Veleiron (río, no mar puro)        |
| wigh        | (44, 11)   | Puerto / Astillero / Playa de Wigh            |
| grimoszk    | (47, 20)   | Grimoszk: Puerto / Muelle / Astillero         |
| drimelan    | (55, 12)   | Barrio del puerto: Muelle de Drimelan         |
| aldara      | (56, 18)   | Muelle de Aldara (+ Fuerte Aldara: Almenas)   |
| arilven     | (58, 13)   | (sin sala "puerto/muelle"; sí Canteras)       |
| schiphol    | (59, 15)   | — (no exploradas)                             |
| keel        | (67, 29)   | Puerto / Muelles / Acantilado de Keel         |
| bucanero    | (79, 13)   | Isla del Bucanero: Muelle Pirata + Astillero  |
| kamana      | (84, 5)    | — (no exploradas)                             |

Veleiron está sobre un río — la celda (43, 21) está en el sistema
marítimo pero el cuerpo de agua interno es fluvial. El mapa de ríos
todavía no lo tenemos.

## Otras observaciones operacionales del log

- **Embarcar/desembarcar**: `embarcarse #N` (con N el ID listado por
  `listar <propietario>`) entra a la nave; `abandonar barco` te
  devuelve al muelle de origen.
- **Recuperar barco amarrado**: `recuperar #N` lo libera del puerto.
  Mensaje: `¡El Barco de Szylah ya está listo para surcar los mares de
  Eirea!`.
- **Otear** (skill con bloqueo): muestra una "carta de radar"
  ASCII-art que dibuja barcos avistados como `o` y el propio como `+`,
  más una lista a la derecha con tipo de barco, distancia (`u.l.`) y
  rumbo cardinal. Útil informativamente, no para navegación
  programática (no da coords exactas, solo bearing relativo).
- **Profesión**: el comando `marinero` cambia el oficio del PJ a
  marinero y le da las habilidades pescar, ruta, abordar, meteorología,
  conocimientos náuticos, crear, otear. Cambiar a marinero **olvida**
  habilidades de oficios previos (artesano: adaptar, crear-de-artesano).
- **Pesca / NPCs marinos**: las salas marinas contienen NPCs como
  Lenguado, Besugo, Atún, Arenque, Bacalao, Caballa, Calamar, Ballena
  azul Joven, Ifrit de los Mares, Espumarajo, Tiburón Pintarroja,
  Tiburón Tigre, Sajuaguín, Lubina, Merluza, Caballito de Mar, Ahogado,
  Ahogada, Dorada, Sirena (probable). Aparecen y desaparecen entre
  ticks — no son estado persistente del mapa.
- **Naufragios**: las celdas con `Restos de un naufragio.` (descripción
  estática) presumiblemente son contenedores con loot saqueable.
- **Viento**: `El viento sigue soplando del sudoeste, aumentando su
  intensidad.` aparece periódicamente. Probablemente afecta velocidad o
  introduce deriva en ciertas direcciones — sin confirmar el efecto
  mecánico todavía.

## Tareas futuras / pendientes

- Confirmar puertos `sirenidos`, `kamana`, `schiphol` con un `look` en
  cada uno (no están en el mapa bundleado).
- Determinar si el viento desvía la posición o solo cambia la
  velocidad. Si desvía, el algoritmo de `navegarsala` necesita un loop
  reactivo más robusto.
- Ríos: cuando aparezca el mapa de ríos, mergear con la doctrina aquí
  o crear `NAVEGACION_RIOS.md` separado si el diseño es lo bastante
  distinto.
- Modelado de barcos enemigos / PvP / abordajes: pendiente.
