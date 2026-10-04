// Weighing-machine abstraction. V1 ships with manual entry only.
//
// To add a Bluetooth scale later, write an adapter with this shape:
//   { name: 'XYZ Scale', connected: true, read: () => Promise<number /* kg */> }
// and call scale.use(adapter). The quantity screen then shows a
// "Read from scale" button for weight-based products; nothing else changes.
let adapter = null;

export const scale = {
  get available() {
    return !!adapter && !!adapter.connected;
  },
  get name() {
    return adapter ? adapter.name : 'Manual entry';
  },
  use(a) {
    adapter = a;
  },
  read() {
    return adapter ? adapter.read() : Promise.reject(new Error('No scale connected'));
  },
};
