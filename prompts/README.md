# Prompts

Cada prompt vive en su propio archivo y se versiona con el codigo.

Ninguna instruccion al modelo se escribe dentro de un `.ts`. La razon es
practica: cuando un guion sale peor que el de la semana pasada, quieres poder
hacer `git log` sobre el prompt y ver que cambio.

## Formato

Texto plano con placeholders `{{nombre}}`. Los rellena `renderPrompt()` desde
`@osaki/llm`. Si falta una variable, la llamada falla antes de gastar nada:
un prompt con un hueco sin rellenar produce basura cara.

## Convencion de nombres

La ruta del archivo es la `key` de la llamada al LLM. `research/investigate.md`
se invoca con `key: 'research/investigate'`, y esa misma key nombra:

- el fixture del proveedor `mock`: `data/fixtures/research/investigate.txt`
- el buzon del proveedor `manual`: `data/exchange/research__investigate/`

Un solo identificador para las tres cosas. Cambiar el nombre de un prompt
mueve su fixture y su buzon con el.
