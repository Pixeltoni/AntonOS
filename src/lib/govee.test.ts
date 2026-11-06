import { describe, expect, it } from 'vitest';
import { controlBody, deviceBody, goveeError, hexToRgbInt, orderLights, parseDevices, parseScenes, parseState, rgbIntToHex, validKey, widgetLights, type LightDevice } from './govee';

const devicesBody = {
  code: 200,
  message: 'success',
  data: [
    {
      sku: 'H6008',
      device: 'AA:BB:CC:DD:EE:FF:00:11',
      deviceName: 'Stehlampe',
      type: 'devices.types.light',
      capabilities: [
        { type: 'devices.capabilities.on_off', instance: 'powerSwitch', parameters: { dataType: 'ENUM' } },
        { type: 'devices.capabilities.range', instance: 'brightness', parameters: { dataType: 'INTEGER', range: { min: 1, max: 100, precision: 1 } } },
        { type: 'devices.capabilities.color_setting', instance: 'colorRgb', parameters: { dataType: 'INTEGER' } },
        { type: 'devices.capabilities.color_setting', instance: 'colorTemperatureK', parameters: { range: { min: 2700, max: 6500 } } },
        { type: 'devices.capabilities.dynamic_scene', instance: 'lightScene', parameters: {} },
      ],
    },
    { sku: 'SameModeGroup', device: '1234', deviceName: 'Wohnzimmer', capabilities: [{ type: 'devices.capabilities.on_off', instance: 'powerSwitch' }] },
    { sku: 'H5179', device: 'XX', deviceName: '', capabilities: [] },
    { sku: 'H6008', device: 'AA:BB:CC:DD:EE:FF:00:11', deviceName: 'doppelt' },
    { deviceName: 'kaputt' },
  ],
};

describe('parseDevices', () => {
  const list = parseDevices(devicesBody);

  it('liest Lampen mit Fähigkeiten, sortiert nach Name', () => {
    expect(list.map((d) => d.name)).toEqual(['H5179', 'Stehlampe', 'Wohnzimmer']);
    const lamp = list.find((d) => d.sku === 'H6008')!;
    expect(lamp).toMatchObject({ power: true, color: true, scenes: true, group: false, brightness: { min: 1, max: 100 }, colorTemp: { min: 2700, max: 6500 } });
  });

  it('erkennt Gruppen und Geräte ohne Fähigkeiten', () => {
    expect(list.find((d) => d.name === 'Wohnzimmer')).toMatchObject({ group: true, power: true, brightness: null, color: false });
    expect(list.find((d) => d.sku === 'H5179')).toMatchObject({ power: false });
  });

  it('verträgt Unsinn', () => {
    expect(parseDevices(null)).toEqual([]);
    expect(parseDevices({ data: 'x' })).toEqual([]);
  });
});

describe('parseState', () => {
  it('liest An/Aus, Helligkeit, Farbe und Weißton', () => {
    const s = parseState({
      payload: {
        capabilities: [
          { instance: 'online', state: { value: true } },
          { instance: 'powerSwitch', state: { value: 1 } },
          { instance: 'brightness', state: { value: 42 } },
          { instance: 'colorRgb', state: { value: 16744448 } },
          { instance: 'colorTemperatureK', state: { value: 0 } },
        ],
      },
    });
    expect(s).toEqual({ online: true, on: true, brightness: 42, color: '#ff8000', colorTemp: null });
  });

  it('leere Werte bleiben unbekannt', () => {
    expect(parseState({ payload: { capabilities: [{ instance: 'brightness', state: { value: '' } }, { instance: 'powerSwitch', state: { value: 0 } }] } })).toMatchObject({ on: false, brightness: null });
  });
});

describe('parseScenes', () => {
  it('liest Szenen mit Wert', () => {
    const scenes = parseScenes({ payload: { capabilities: [{ instance: 'lightScene', parameters: { options: [{ name: 'Sonnenuntergang', value: { paramId: 1, id: 2 } }, { name: '' , value: 1 }, { name: 'ohne' }] } }] } });
    expect(scenes).toEqual([{ name: 'Sonnenuntergang', value: { paramId: 1, id: 2 } }]);
  });
});

describe('Farben', () => {
  it('rechnet hin und zurück', () => {
    expect(hexToRgbInt('#FF8000')).toBe(0xff8000);
    expect(hexToRgbInt('ff8000')).toBe(0xff8000);
    expect(hexToRgbInt('rot')).toBeNull();
    expect(rgbIntToHex(255)).toBe('#0000ff');
  });
});

describe('controlBody', () => {
  const lamp = parseDevices(devicesBody).find((d) => d.sku === 'H6008')!;
  const group = parseDevices(devicesBody).find((d) => d.group)!;

  it('baut Befehle mit begrenzten Werten', () => {
    expect(controlBody(lamp, { kind: 'power', on: true }, 'r1')).toEqual({
      requestId: 'r1',
      payload: { sku: 'H6008', device: lamp.id, capability: { type: 'devices.capabilities.on_off', instance: 'powerSwitch', value: 1 } },
    });
    expect((controlBody(lamp, { kind: 'brightness', value: 250 }, 'r') as { payload: { capability: { value: number } } }).payload.capability.value).toBe(100);
    expect((controlBody(lamp, { kind: 'brightness', value: 0 }, 'r') as { payload: { capability: { value: number } } }).payload.capability.value).toBe(1);
    expect((controlBody(lamp, { kind: 'colorTemp', kelvin: 9000 }, 'r') as { payload: { capability: { value: number } } }).payload.capability.value).toBe(6500);
    expect((controlBody(lamp, { kind: 'color', hex: '#00ff00' }, 'r') as { payload: { capability: { value: number } } }).payload.capability.value).toBe(0x00ff00);
  });

  it('lehnt ab, was die Lampe nicht kann', () => {
    expect(controlBody(group, { kind: 'color', hex: '#ffffff' }, 'r')).toBeNull();
    expect(controlBody(lamp, { kind: 'color', hex: 'quatsch' }, 'r')).toBeNull();
  });

  it('Zustand abfragen', () => {
    expect(deviceBody(lamp, 'x')).toEqual({ requestId: 'x', payload: { sku: 'H6008', device: lamp.id } });
  });
});

describe('goveeError', () => {
  it('übersetzt Fehler', () => {
    expect(goveeError(200, { code: 200 })).toBeNull();
    expect(goveeError(401, null)).toMatch(/Schlüssel/);
    expect(goveeError(200, { code: 429 })).toMatch(/Zu viele/);
    expect(goveeError(400, { msg: 'bad param' })).toBe('Govee: bad param');
  });
});

describe('validKey', () => {
  it('prüft die Form', () => {
    expect(validKey('12345678-abcd-1234-abcd-1234567890ab')).toBe(true);
    expect(validKey('zu kurz')).toBe(false);
  });
});

describe('Reihenfolge und Widget', () => {
  const mk = (id: string): LightDevice => ({ id, sku: 'H1', name: id, group: false, power: true, brightness: null, color: false, colorTemp: null, scenes: false });
  const list = ['a', 'b', 'c', 'd'].map(mk);

  it('eigene Reihenfolge zuerst, Ausgeblendete weg', () => {
    expect(orderLights(list, ['c', 'a'], ['b']).map((d) => d.id)).toEqual(['c', 'a', 'd']);
    expect(orderLights(list, ['c', 'a'], ['b'], true).map((d) => d.id)).toEqual(['c', 'a', 'd', 'b']);
  });

  it('Widget bekommt nur schaltbare Lampen mit letztem Zustand', () => {
    const out = widgetLights([...list, { ...mk('e'), power: false }], { a: { online: true, on: true, brightness: 50, color: '#ff0000', colorTemp: null } });
    expect(out.map((l) => l.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(out[0]).toEqual({ id: 'a', sku: 'H1', name: 'a', on: true, color: '#ff0000', brightness: 50 });
    expect(out[1].on).toBe(false);
  });
});
