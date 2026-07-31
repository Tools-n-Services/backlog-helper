# Documentación — Español

**Idiomas:** [English](../en/) · [Español](../es/) · [Русский](../)

Un portal de feedback que alojas tú: solicitudes de funciones y reportes de errores,
triaje, backlog, roadmap y changelog en un solo modelo de datos. Se instala en tu
servidor con un comando y se configura en el navegador.

## Operar el portal

| Documento | De qué trata |
|---|---|
| [12-install.md](12-install.md) | Instalación paso a paso: preparación, `.env`, arranque, asistente, comprobación, actualización y los fallos habituales |
| [11-manual.md](11-manual.md) | Manual de uso: para el visitante, para el equipo, para el administrador |
| [10-operate.md](10-operate.md) | Desplegar, configurar, actualizar: las tres capas de configuración y qué sobrevive a una actualización |

## Documentos de diseño

Están en ruso y son la fuente de verdad: cambian en cada iteración, y mantener tres
copias de acuerdo a mano costaría más de lo que aporta.

| Documento | De qué trata |
|---|---|
| [00-product.md](../00-product.md) | Descripción del producto: el problema, para quién es, en qué se diferencia |
| [01-functional-spec.md](../01-functional-spec.md) | Requisitos: parte pública, administración, notificaciones, integraciones |
| [02-data-model.md](../02-data-model.md) | Entidades, índices, invariantes de fusión y votos |
| [03-architecture.md](../03-architecture.md) | Stack, estructura del repositorio, reglas del fork |
| [05-bug-intake.md](../05-bug-intake.md) | Recepción de errores: calidad, diagnóstico, triaje, privacidad |
| [06-backlog.md](../06-backlog.md) | Backlog: priorización, insights, sincronización con el tracker |
| [07-ui-brief.md](../07-ui-brief.md) | Brief de diseño: superficies, tokens, estados |
| [08-dev-plan.md](../08-dev-plan.md) | Plan de desarrollo por iteraciones y su estado actual |
| [09-install.md](../09-install.md) | Cómo están hechos la instalación por asistente y la configuración en la base |

## Los tres circuitos

```
   RECEPCIÓN               TRIAJE                  BACKLOG
solicitudes ─────────►  una decisión en cada ─────────►  unidades de trabajo
(portal, widget,        (aceptar, fusionar,          (prioridad, enlace N:M
 correo, soporte, API)   pedir datos, rechazar)       con solicitudes, tracker)
     ▲                                                        │
     └──────── correo, roadmap, changelog ◄───────────────────┘
                     (cerrar el círculo)
```

El tercero es aquello por lo que existe el producto: sin él, un portal es un muro de
deseos.

## Glosario

- **Tablero** — sección de primer nivel del portal: «Solicitudes», «Errores», «API».
- **Solicitud** — unidad de señal entrante. Tiene **tipo** (idea, error, pregunta),
  estado y votos.
- **Voto** — «yo también lo necesito» en una idea, «a mí también me pasa» en un error.
  Una persona, un voto.
- **Severity** — cuánto molesta, según el **reportero**. **Priority** — cuánto importa,
  según el **equipo**. Dos campos distintos que no deben fusionarse.
- **Estado** — la etapa pública de una solicitud (`open → planned → building → completed`).
- **Unidad de backlog** — unidad interna de trabajo, unida N:M a las solicitudes, con su
  etapa interna que se proyecta sobre un estado público.
- **Insight** — cita de un usuario recogida fuera del portal (llamada, ticket, chat),
  unida a una solicitud o a una unidad.
- **Roadmap** — resumen público de solicitudes por estado de todos los tableros.
- **Changelog** — listado de versiones enlazado con las solicitudes que cerraron.
- **Fusión** — plegar un duplicado en la solicitud principal llevándose votos y
  suscriptores.
