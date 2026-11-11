import { app } from './app.js';
import { iniciarTareasCaja } from './modules/cuadratura/avisos.js';
import { iniciarTareasTienda } from './modules/tienda/tareasTienda.js';

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`FarmaClick API escuchando en http://localhost:${port}`));

// Cierre automático de cajas (23:59) y recordatorios por correo. Ver modules/cuadratura/avisos.js.
iniciarTareasCaja();

// Pedidos web sin pagar después de 20 minutos: pasan a "Expirado" y devuelven el stock. Ver modules/tienda/tareasTienda.js.
iniciarTareasTienda();
