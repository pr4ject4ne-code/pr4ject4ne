/**
 * @jest-environment jsdom
 *
 * LocationPicker (worklist #35) is a thin MapLibre wrapper, so — same
 * approach as this project's other map-adjacent code (src/lib/__tests__/
 * map.test.ts tests pure helpers, not real map rendering) — `maplibre-gl`
 * itself is mocked. These tests prove the CONTRACT: clicking the map and
 * dragging the marker both report `{lat, lng}` via onChange, and external
 * lat/lng prop changes move the marker (both directions of the "controlled
 * component" sync the task asks for).
 */
import { render } from '@testing-library/react';
import LocationPicker from '@/components/LocationPicker';

interface LngLat {
  lat: number;
  lng: number;
}

// Instance registries populated by the mocked classes below. `let` (not
// `const` array-of-class-instance) so the jest.mock factory — hoisted above
// this file's other declarations — can push into them without a
// temporal-dead-zone reference error.
type MockMarker = {
  setLngLat: (v: [number, number] | LngLat) => MockMarker;
  getLngLat: () => LngLat;
  addTo: () => MockMarker;
  on: (event: string, cb: () => void) => MockMarker;
  simulateDrag: (v: LngLat) => void;
};
type MockMap = {
  addControl: () => MockMap;
  on: (event: string, cb: (e: unknown) => void) => MockMap;
  easeTo: () => void;
  remove: () => void;
  simulateClick: (lngLat: LngLat) => void;
};
let mapInstances: MockMap[] = [];
let markerInstances: MockMarker[] = [];

jest.mock('maplibre-gl', () => {
  function toLngLat(v: [number, number] | LngLat): LngLat {
    return Array.isArray(v) ? { lng: v[0], lat: v[1] } : v;
  }

  class Marker implements MockMarker {
    private pos: LngLat = { lat: 0, lng: 0 };
    private dragHandler: (() => void) | null = null;
    constructor() {
      markerInstances.push(this);
    }
    setLngLat(v: [number, number] | LngLat) {
      this.pos = toLngLat(v);
      return this;
    }
    getLngLat() {
      return this.pos;
    }
    addTo() {
      return this;
    }
    on(event: string, cb: () => void) {
      if (event === 'dragend') this.dragHandler = cb;
      return this;
    }
    simulateDrag(v: LngLat) {
      this.pos = v;
      this.dragHandler?.();
    }
  }

  class Map implements MockMap {
    private handlers: Record<string, Array<(e: unknown) => void>> = {};
    constructor() {
      mapInstances.push(this);
    }
    addControl() {
      return this;
    }
    on(event: string, cb: (e: unknown) => void) {
      (this.handlers[event] ??= []).push(cb);
      return this;
    }
    easeTo() {}
    remove() {}
    simulateClick(lngLat: LngLat) {
      this.handlers.click?.forEach((cb) => cb({ lngLat }));
    }
  }

  class NavigationControl {}
  return { __esModule: true, default: { Map, Marker, NavigationControl } };
});

beforeEach(() => {
  mapInstances.length = 0;
  markerInstances.length = 0;
});

describe('LocationPicker', () => {
  it('renders a map container', () => {
    const { getByTestId } = render(<LocationPicker lat={6.45} lng={7.5} onChange={jest.fn()} />);
    expect(getByTestId('location-picker-map')).toBeInTheDocument();
  });

  it('defaults to DEFAULT_CENTER when no coords are given', () => {
    render(<LocationPicker onChange={jest.fn()} />);
    expect(markerInstances).toHaveLength(1);
    // Enugu-centered default (geolocation.ts's DEFAULT_CENTER).
    expect(markerInstances[0]!.getLngLat()).toEqual({ lat: 6.4584, lng: 7.5464 });
  });

  it('reports the clicked coordinates via onChange and moves the pin', () => {
    const onChange = jest.fn();
    render(<LocationPicker lat={6.45} lng={7.5} onChange={onChange} />);
    mapInstances[0]!.simulateClick({ lat: 6.5, lng: 7.6 });
    expect(onChange).toHaveBeenCalledWith({ lat: 6.5, lng: 7.6 });
    expect(markerInstances[0]!.getLngLat()).toEqual({ lat: 6.5, lng: 7.6 });
  });

  it('reports the dragged-to coordinates via onChange', () => {
    const onChange = jest.fn();
    render(<LocationPicker lat={6.45} lng={7.5} onChange={onChange} />);
    markerInstances[0]!.simulateDrag({ lat: 6.55, lng: 7.55 });
    expect(onChange).toHaveBeenCalledWith({ lat: 6.55, lng: 7.55 });
  });

  it('moves the pin when lat/lng props change externally (e.g. manual inputs)', () => {
    const { rerender } = render(<LocationPicker lat={6.45} lng={7.5} onChange={jest.fn()} />);
    rerender(<LocationPicker lat={6.7} lng={7.8} onChange={jest.fn()} />);
    expect(markerInstances[0]!.getLngLat()).toEqual({ lat: 6.7, lng: 7.8 });
  });
});
