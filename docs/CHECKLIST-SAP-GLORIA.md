# Checklist técnico — Integración SAP PM (Cliente: Gloria)

Documento para solicitar al equipo de TI/SAP de Gloria los datos necesarios
para conectar el GMAO con su SAP PM. El GMAO ya soporta proveedor + **tipo de
conexión configurable** (REST/OData/SOAP/RFC) y autenticación.

---

## 1. Tipo de conexión que expone su SAP
Marcar la que aplique (define el adaptador a usar):

- [ ] **OData / SAP Gateway** (recomendado, ya operativo en el GMAO)
  - Versión de SAP Gateway / S/4HANA
  - URL base del servicio OData (ej. `https://sapgw.gloria.com.pe/sap/opu/odata/sap/`)
  - Nombre de los servicios/EntitySets para: Equipos (Equipment/FuncLocation),
    Avisos (Notification), Órdenes (Order), Reservas (Reservation)
- [ ] **SOAP / Web Service (PI/PO)**
  - WSDL de cada servicio
  - Endpoint(s)
- [ ] **RFC / BAPI** (requiere middleware: SAP Cloud Connector, PI/PO o RFC-REST gateway)
  - BAPIs a usar (ej. `BAPI_ALM_NOTIF_CREATE`, `BAPI_ALM_ORDER_MAINTAIN`,
    `BAPI_RESERVATION_CREATE1`)
  - ¿Hay un gateway REST/OData que exponga estos BAPIs?
- [ ] **REST/JSON propio** (si tienen una capa intermedia)
  - URL base + documentación de endpoints

## 2. Autenticación
- [ ] Tipo: ☐ Usuario/Contraseña (Basic)  ☐ Token (Bearer/OAuth2)  ☐ API Key  ☐ Certificado
- [ ] Si OAuth2: token URL, client_id, client_secret, scope
- [ ] Si API Key: nombre del header y valor
- [ ] **Usuario de servicio (técnico) dedicado** para la integración (no usuario personal)
- [ ] Roles/autorizaciones SAP del usuario de servicio (mínimo: crear/leer aviso,
      orden, reserva; leer maestro de equipos y materiales)

## 3. Red y seguridad
- [ ] ¿El servicio es accesible por internet o está en red interna?
  - Si interno: ¿VPN, IP whitelisting, o SAP Cloud Connector? IPs de salida a autorizar
- [ ] Certificado TLS válido (¿self-signed? compartir CA)
- [ ] Ambiente de **pruebas (QAS)** disponible antes de Producción

## 4. Mapeo de datos (qué se sincroniza y en qué dirección)
Por cada entidad, indicar dirección y campos clave:

| Entidad GMAO | Objeto SAP PM | Dirección | Campos clave / mapeo |
|---|---|---|---|
| Equipos | Equipment / Ubicación funcional | ☐ SAP→GMAO ☐ GMAO→SAP | nº equipo, ubic. técnica, centro |
| Avisos | Notification (IW21) | ☐ GMAO→SAP ☐ ambos | tipo (M1/M2/M3), prioridad, equipo |
| Órdenes | Order (IW31/32) | ☐ GMAO→SAP ☐ ambos | tipo, centro de coste, operaciones |
| Materiales | Maestro de materiales | ☐ SAP→GMAO | nº material, centro, almacén, stock |
| Reservas | Reservation | ☐ GMAO→SAP | material, cantidad, centro, OT |
| Confirmaciones | Time confirmation (IW41) | ☐ GMAO→SAP | horas, operario |

- [ ] **Centro(s)** y **almacén(es)** de Gloria a considerar
- [ ] Catálogo de **clases de aviso** y **clases de orden** que usan
- [ ] Frecuencia de sincronización deseada: ☐ tiempo real (evento) ☐ cada N min ☐ manual

## 5. Volumen y rendimiento
- [ ] Cantidad aproximada de equipos, materiales, avisos/OTs por día
- [ ] Ventana de mantenimiento de SAP (cuándo NO sincronizar)

## 6. Contactos
- [ ] Responsable funcional SAP PM (nombre, correo)
- [ ] Responsable técnico/Basis (nombre, correo)
- [ ] Responsable de seguridad/red

---

### Notas para el equipo GMAO
- Lo más rápido de poner en marcha es **OData** (ya operativo: el GMAO postea
  los registros pendientes por entidad y los marca como sincronizados).
- Para **RFC/BAPI** puro se necesita un gateway (Cloud Connector / PI-PO / capa
  REST). El tipo de conexión ya es seleccionable en el panel de Integraciones.
- Empezar **outbound** (GMAO→SAP) con una entidad (ej. Avisos) en **QAS**, validar,
  y luego ampliar a las demás y a inbound.
