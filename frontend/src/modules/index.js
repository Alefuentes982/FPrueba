// Registro de módulos del frontend. Cada módulo es una carpeta con un index.jsx que exporta:
//   nombre, modulo (clave de permiso), nav [{ to, label, icon, orden }], rutas [{ path, element }]
//   extensiones { 'slot': Componente } (opcional: contenido que inyecta en pantallas de otros módulos)
// Sumar un módulo = crear su carpeta y agregarlo aquí.
import { registrarExtensiones } from '../extensiones.jsx';
import usuarios from './usuarios/index.jsx';

const modulos = [usuarios];
modulos.forEach((m) => registrarExtensiones(m.nombre, m.extensiones));

export default modulos;
