/**
 * Minimal Leaflet test double for jsdom (Leaflet needs real layout/canvas).
 * Records created layers and popups so tests can assert on what the map shows.
 */
type Handler = (e: { latlng: { lat: number; lng: number } }) => void

export const created = {
  markers: [] as FakeMarker[],
  maps: [] as FakeMap[],
}

class FakeLayer {
  addTo(target: FakeMap | FakeLayerGroup) {
    target.addLayer(this)
    return this
  }
}

export class FakeMarker extends FakeLayer {
  popup = ''
  constructor(public latlng: [number, number]) {
    super()
    created.markers.push(this)
  }
  bindPopup(html: string) {
    this.popup = html
    return this
  }
  setLatLng(latlng: [number, number]) {
    this.latlng = latlng
    return this
  }
}

export class FakeLayerGroup extends FakeLayer {
  layers: FakeLayer[] = []
  addLayer(layer: FakeLayer) {
    this.layers.push(layer)
  }
  clearLayers() {
    this.layers = []
  }
}

export class FakeMap {
  layers: FakeLayer[] = []
  handlers: Record<string, Handler[]> = {}
  center: [number, number] = [0, 0]
  overlayPane = document.createElement('div')
  constructor(public container: HTMLElement) {
    container.appendChild(this.overlayPane)
    created.maps.push(this)
  }
  setView(center: [number, number]) {
    this.center = center
    return this
  }
  panTo(center: [number, number]) {
    this.center = center
    return this
  }
  on(events: string, fn: Handler) {
    for (const e of events.split(' ')) (this.handlers[e] ??= []).push(fn)
    return this
  }
  off() {
    return this
  }
  fire(event: string, payload: { latlng: { lat: number; lng: number } }) {
    for (const fn of this.handlers[event] ?? []) fn(payload)
  }
  addLayer(layer: FakeLayer) {
    this.layers.push(layer)
  }
  removeLayer(layer: FakeLayer) {
    this.layers = this.layers.filter(l => l !== layer)
  }
  eachLayer(fn: (layer: FakeLayer) => void) {
    ;[...this.layers].forEach(fn)
  }
  getPanes() {
    return { overlayPane: this.overlayPane }
  }
  latLngToContainerPoint([lat, lng]: [number, number]) {
    return { x: lng, y: lat }
  }
  remove() {
    this.layers = []
  }
}

const L = {
  map: (el: HTMLElement) => new FakeMap(el),
  tileLayer: () => new FakeLayer(),
  marker: (latlng: [number, number]) => new FakeMarker(latlng),
  layerGroup: () => new FakeLayerGroup(),
  divIcon: (opts: unknown) => opts,
  Marker: FakeMarker,
  CircleMarker: class {},
  Icon: { Default: { prototype: {}, mergeOptions: () => undefined } },
}

export default L
