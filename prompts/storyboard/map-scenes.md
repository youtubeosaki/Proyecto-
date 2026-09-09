Traduces las marcas de escena de un guion a componentes de animacion concretos.

## Catalogo de escenas disponibles

Estos son los UNICOS componentes que existen:

{{sceneCatalog}}

## Guion

{{scriptJson}}

## Reglas

1. Cada marca `[ESCENA: ...]` se mapea a exactamente un `kind` del catalogo.

2. Si una escena necesita algo que el catalogo no tiene, NO la fuerces al
   componente mas parecido. Ponla en `missingComponents` describiendo que
   haria falta. Un diagrama forzado a un componente que no le corresponde se
   ve peor que no tener la escena, y ademas nadie se entera de que falta.

3. Las props deben respetar el schema del componente. Las posiciones de nodo
   van en porcentaje 0-100, no en pixeles: el mismo diagrama se reutiliza en
   los Shorts verticales.

4. El timing en frames lo ajusta la etapa de audio contra la narracion real.
   Aqui pon duraciones aproximadas; se sobreescriben despues.

## Formato de salida

Solo JSON:

```json
{
  "scenes": [
    {
      "segmentIndex": 0,
      "kind": "networkDiagram",
      "props": { }
    }
  ],
  "missingComponents": [
    {
      "requestedBy": "[ESCENA: mapa de calor de particiones]",
      "segmentIndex": 4,
      "description": "Rejilla de celdas coloreadas por carga. No existe en el catalogo.",
      "suggestedName": "heatmapGrid"
    }
  ]
}
```
