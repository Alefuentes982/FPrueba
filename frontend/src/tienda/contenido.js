// Textos y datos de la tienda que se cambian sin tocar la lógica: datos de la farmacia, banners de la portada y
// funciones que se activan en sprints siguientes. Los productos, precios, stock y sucursales vienen de la API.

// Datos que la ley pide mostrar o que el cliente necesita. Un valor null no se muestra.
// PENDIENTE (PO con MediFarm): completar antes de abrir la tienda en producción.
export const FARMACIA = {
  horario: 'Lunes a domingo, de 9:00 a 22:00',
  horarioCorto: 'Abierto todos los días, 9:00 a 22:00',
  horaCorteRetiro: '18:00',          // pedidos pagados antes de esta hora quedan listos el mismo día
  ventaTelefonica: null,             // por ejemplo '+56 2 2345 6789'
  quimicoResponsable: null,          // nombre del químico farmacéutico responsable
  autorizacionSanitaria: null,       // número de la resolución sanitaria de la farmacia
};

// Funciones del diseño aprobado que dependen de historias de sprints siguientes. Cada historia cambia su valor a
// true cuando entrega lo que la función necesita. Mientras estén en false, la tienda no muestra esos elementos.
export const FUNCIONES = {
  cuenta: true,         // HU-68: iniciar sesión y crear cuenta (Sprint 6)
  checkout: false,      // HU-71: continuar la compra desde el carro (Sprint 6)
  despacho: false,      // HU-71 y HU-78: despacho a domicilio con costo por comuna (Sprints 6 y 7)
  seguimiento: false,   // HU-75: sigue tu pedido (Sprint 7)
};

// Enlaces legales. Se muestran en el pie solo cuando tienen dirección.
export const LEGALES = {
  terminos: null,
  privacidad: null,
};

// Carrusel de la portada. Mensajes de todo el año: no usar campañas de temporada.
// categoria: nombre exacto de una categoría (el enlace lleva a su listado). ilustraciones: categorías para el dibujo.
export const BANNER_PRINCIPAL = [
  {
    etiqueta: 'Retiro en farmacia sin costo',
    titulo: 'Tu farmacia de siempre, ahora también en línea',
    texto: 'Compra antes de las 18:00 y retira el mismo día. Ves el stock real de la farmacia antes de ir.',
    boton: { texto: 'Ver productos', a: '/tienda/productos' },
    secundario: { texto: '¿Cómo comprar?', a: '/tienda/informacion#como-comprar' },
    tono: 'turquesa',
    ilustraciones: ['Vitaminas y suplementos', 'Dermocosmética', 'Dermocosmética', 'Medicamentos'],
  },
  {
    etiqueta: 'Precios rebajados',
    titulo: 'Ofertas vigentes con el precio final a la vista',
    texto: 'Descuentos en productos seleccionados y precios por cantidad en medicamentos de uso frecuente.',
    boton: { texto: 'Ver ofertas', a: '/tienda/productos?ofertas=1' },
    tono: 'morado',
    ilustraciones: ['Cuidado personal', 'Bebé y maternidad', 'Dermocosmética', 'Vitaminas y suplementos'],
  },
  {
    etiqueta: 'Venta directa',
    titulo: 'Medicamentos sin receta, listos para retirar',
    texto: 'Analgésicos, antialérgicos y más, con su presentación y precio en cada ficha.',
    boton: { texto: 'Ver medicamentos', categoria: 'Medicamentos' },
    tono: 'verde',
    ilustraciones: ['Medicamentos', 'Medicamentos', 'Primeros auxilios', 'Medicamentos'],
  },
];

export const BANNERS_LATERALES = [
  { titulo: 'Cuida tu piel todo el año', texto: 'Protección solar, limpieza e hidratación.', enlace: 'Ver dermocosmética', categoria: 'Dermocosmética', tono: 'durazno' },
  { titulo: 'Vitaminas para tu día a día', texto: 'Vitaminas, minerales y suplementos.', enlace: 'Ver vitaminas', categoria: 'Vitaminas y suplementos', tono: 'lima' },
];

// Bloques de categoría de la portada (banner + 4 productos más vendidos). Si una categoría no tiene productos, no
// se muestra.
export const BLOQUES_CATEGORIA = [
  { categoria: 'Dermocosmética', titulo: 'Cuida tu piel todo el año', texto: 'Protección solar, hidratación y limpieza facial.', tono: 'naranjo' },
  { categoria: 'Vitaminas y suplementos', titulo: 'Energía para tu día a día', texto: 'Vitaminas, minerales y colágeno.', tono: 'verde' },
];

// Bloque "Infórmate y cuida tu salud". Números revisados el 27-10-2026 en minsal.cl y uc.cl.
export const SALUD = [
  { icono: 'bi-heart-pulse', titulo: 'Salud Responde', numero: '600 360 7777', texto: 'Orientación en salud del Ministerio de Salud, gratis, las 24 horas.' },
  { icono: 'bi-shield-plus', titulo: 'Emergencias toxicológicas', numero: '+56 2 2635 3800', texto: 'CITUC atiende consultas por intoxicaciones.' },
  { icono: 'bi-capsule', titulo: 'Uso responsable de medicamentos', texto: 'Lee el envase y el folleto, respeta la dosis y consulta si tienes dudas.', a: '/tienda/informacion#receta' },
  { icono: 'bi-file-earmark-medical', titulo: 'Venta directa y con receta', texto: 'En línea vendemos solo productos de venta directa. Los demás, en la farmacia.', a: '/tienda/informacion#receta' },
];

export const BENEFICIOS = [
  { icono: 'bi-clock', titulo: 'Ahorra tiempo', texto: 'Arma tu pedido desde la casa y retira sin hacer fila.' },
  { icono: 'bi-shop', titulo: 'Stock real', texto: 'Ves lo que hay en la farmacia en este momento.' },
  { icono: 'bi-card-text', titulo: 'Información clara', texto: 'Presentación, precio y descuentos en cada ficha.' },
  { icono: 'bi-bag-check', titulo: 'Retiro sin costo', texto: 'Te avisamos cuando tu pedido esté listo en la farmacia.' },
];
