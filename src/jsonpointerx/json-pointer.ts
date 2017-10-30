const fromJpStringSearch: RegExp = /~[01]/g;
const toJpStringSearch: RegExp = /[~\/]/g;

export class JsonPointer {
  private _segments: string[];
  get segments(): string[] { return this._segments.slice(0); }

  get root(): boolean { return this._segments.length === 0 ? true : false; }

  private fnGet: (input: string) => any;

  constructor(segments?: string|string[], noCompile?: boolean) {
    if (segments) {
      if (Array.isArray(segments)) {
        this._segments = segments;
      } else {
        this._segments = [segments];
      }
    } else {
      this._segments = [];
    }
    if (noCompile) {
      this.fnGet = this.getUncompiled;
    } else {
      this.compileFunctions();
    }
  }

  get(input: any): any { return this.fnGet(input); }

  getUncompiled(input: any): any {
    let node = input;
    for (let idx = 0; idx < this._segments.length;) {
      // tslint:disable-next-line triple-equals
      if (node == undefined) {
        return undefined;
      }
      node = node[this._segments[idx++]];
    }
    return node;
  }


  /**
   * set value
   *
   * @param input
   * @param [value]
   * @returns       returns 'value' if pointer.length === 1 or 'input' otherwise
   *
   * throws if 'input' is not an object
   * throws if set is called for a root JSON pointer
   * throws on invalid array index references
   * throws if one of the ancestors is a scalar (js engine): Cannot create propery 'foo' on 'baz
   */
  set(input: any, value?: any): any {
    if (typeof input !== 'object') {
      throw new Error('Invalid input object.');
    }
    if (this._segments.length === 0) {
      throw new Error(`Set for root JSON pointer is not allowed.`);
    }

    const len = this._segments.length - 1;
    let node = input;
    let nextnode: any;
    let part: string;

    for (let idx = 0; idx < len;) {
      part = this._segments[idx++];
      nextnode = node[part];
      // tslint:disable-next-line triple-equals
      if (nextnode == undefined) {
        if (this._segments[idx] === '-') {
          nextnode = [];
        } else {
          nextnode = {};
        }
        if (Array.isArray(node)) {
          if (part === '-') {
            node.push(nextnode);
          } else {
            let i = parseInt(part, 10);
            if (isNaN(i)) {
              throw Error(`Invalid JSON pointer array index reference (level ${idx}).`);
            }
            node[i] = nextnode;
          }
        } else {
          node[part] = nextnode;
        }
      }
      node = nextnode;
    }

    if (value === undefined) {
      delete node[this._segments[len]];
    } else {
      if (Array.isArray(node)) {
        let i = parseInt(this._segments[len], 10);
        if (isNaN(i)) {
          throw Error(`Invalid JSON pointer array index reference at end of pointer.`);
        }
        node[i] = value;
      } else {
        node[this._segments[len]] = value;
      }
    }
    return input;
  }

  concat(p: JsonPointer): JsonPointer { return new JsonPointer(this._segments.concat(p.segments)); }
  concatSegment(segment: string|string[]): JsonPointer { return new JsonPointer(this._segments.concat(segment)); }
  concatPointer(pointer: string): JsonPointer { return this.concat(JsonPointer.compile(pointer)); }

  toString(): string {
    if (this._segments.length === 0) {
      return '';
    }
    return '/'.concat(
        // tslint:disable-next-line: no-unbound-method
        this._segments.map((v: string) => v.replace(toJpStringSearch, JsonPointer.toJpStringReplace)).join('/'));
  }

  toURIFragmentIdentifier(): string {
    if (this._segments.length === 0) {
      return '#';
    }
    return '#/'.concat(
        this._segments
            // tslint:disable-next-line: no-unbound-method
            .map((v: string) => encodeURIComponent(v).replace(toJpStringSearch, JsonPointer.toJpStringReplace))
            .join('/'));
  }

  private compileFunctions(): void {
    let body = '';

    for (let idx = 0; idx < this._segments.length;) {
      let segment = this._segments[idx++].replace(/\\/g, '\\\\');
      body += `
      if (node == undefined) return undefined;
      node = node['${segment}'];
      `;
    }
    body += `
      return node;
    `;
    this.fnGet = new Function('node', body) as(input: string) => any;
  }

  static compile(pointer: string, decodeOnly?: boolean): JsonPointer {
    let segments = pointer.split('/');
    let firstSegment = segments.length >= 1 ? segments.shift() : undefined;
    if (firstSegment === '') {
      return new JsonPointer(
          // tslint:disable-next-line: no-unbound-method
          segments.map((v: string) => v.replace(fromJpStringSearch, JsonPointer.fromJpStringReplace)), decodeOnly);
    }
    if (firstSegment === '#') {
      return new JsonPointer(
          segments.map(
              // tslint:disable-next-line: no-unbound-method
              (v: string) => decodeURIComponent(v.replace(fromJpStringSearch, JsonPointer.fromJpStringReplace))),
          decodeOnly);
    }
    throw new Error(`JSON pointer '${pointer}' is invalid.`);
  }

  static get(obj: any, pointer: string): any { return JsonPointer.compile(pointer).get(obj); }
  static set(obj: any, pointer: string, value: any): any { return JsonPointer.compile(pointer, true).set(obj, value); }

  static fromJpStringReplace(v: string): string {
    switch (v) {
      case '~1':
        return '/';
      case '~0':
        return '~';
    }
    throw new Error('JsonPointer.escapedReplacer: this should not happen');
  }

  static toJpStringReplace(v: string): string {
    switch (v) {
      case '/':
        return '~1';
      case '~':
        return '~0';
    }
    throw new Error('JsonPointer.unescapedReplacer: this should not happen');
  }
}
