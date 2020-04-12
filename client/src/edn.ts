export type EDNVal = EDNTaggableVal | EDNTaggedVal | Date;
export type EDNTaggableVal =
  | EDNMap
  | EDNVector
  | EDNSet
  | string
  | number
  | boolean
  | null
  | bigint
  | EDNKeyword
  | EDNChar
  | EDNSymbol
  | EDNList;
export type EDNMap = Map<EDNVal, EDNVal>;
export type EDNVector = EDNVal[];
export type EDNSet = Set<EDNVal>;
export type EDNKeyword = { key: string };
export type EDNChar = { char: string };
export type EDNSymbol = { sym: string };
export type EDNList = { list: EDNVal[] };
export type EDNTaggedVal = { tag: string; val: EDNVal };

const isEDNKeyword = (value: Record<string, EDNVal>): value is EDNKeyword => {
  return value.key !== undefined;
};

const isEDNSymbol = (value: Record<string, EDNVal>): value is EDNSymbol => {
  return value.sym !== undefined;
};

const isEDNList = (value: Record<string, EDNVal>): value is EDNList => {
  return value.list !== undefined;
};

const isEDNTaggedVal = (
  value: Record<string, EDNVal>,
): value is EDNTaggedVal => {
  return value.tag !== undefined;
};

const isEDNChar = (value: Record<string, EDNVal>): value is EDNChar => {
  return value.char !== undefined;
};

// TODO: Tag has char restrictions
export const tagValue = (tag: string, value: EDNVal): EDNTaggedVal => {
  return { tag, val: value };
};

// TODO: Keyword has char restrictions
export const keyword = (value: string): EDNKeyword => {
  return { key: value };
};

export const toEDNString = (value: EDNVal): string => {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (value instanceof Map) {
    return `{${[...value]
      .map(([k, v]: [EDNVal, EDNVal]) => `${toEDNString(k)} ${toEDNString(v)}`)
      .join(' ')}}`;
  }

  if (Array.isArray(value)) {
    return `[${value.map(toEDNString).join(' ')}]`;
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (value instanceof Set) {
    return `#{${[...value].map(toEDNString).join(' ')}}`;
  }

  if (value === null) {
    return 'nil';
  }

  if (value instanceof Date) {
    return `#inst "${value.toISOString()}"`;
  }

  if (typeof value === 'bigint') {
    return `${value}N`;
  }

  if (isEDNKeyword(value)) {
    return `:${value.key}`;
  }

  if (isEDNSymbol(value)) {
    return value.sym;
  }

  if (isEDNList(value)) {
    return `(${value.list.map(toEDNString).join(' ')})`;
  }

  if (isEDNTaggedVal(value)) {
    return `#${value.tag} ${toEDNString(value.val)}`;
  }

  if (isEDNChar(value)) {
    return `\${value.char}`;
  }

  throw new TypeError(`Unknown type: ${JSON.stringify(value)}`);
};

enum ParseMode {
  idle,
  string,
  escape,
  vector,
  list,
  map,
  set,
}

const stringEscapeMap = {
  t: '\t',
  r: '\r',
  n: '\n',
  '\\': '\\',
  '"': '"',
};

const spaceChars = [',', ' ', '\t', '\n', '\r'];

const intRegex = /^[-+]?[0-9][1-9]*$/;
const floatRegex = /^[-+]?[0-9][1-9]*(\.[0-9]+)?([eE][+-]?[0-9]+)?M?$/;

// TODO: support tag
// TODO: support #inst
// TODO: support chars
// TODO: support bigint
// TODO: support comment
// TODO: support discard
// TODO: keywords should contain a single slash
// TODO: keywords and symbols need some care with characters
// TODO: tag if not one of the well known must contain exactly one slash
// TODO: What happens with empty doc
// TODO: Error when wrong closing tag
// TODO: Streaming maybe
export const parseEDNString = (edn: string): EDNVal => {
  const stack = [];
  let mode = ParseMode.idle;
  let state ='';
  let result: EDNVal|undefined;

  const updateStack = () => {
    if (stack.length === 0 || result === undefined) {
      return
    }
    const [prevMode, prevState] = stack[stack.length - 1];
    if (prevMode === ParseMode.vector) {
      prevState.push(result);
    } else if (prevMode === ParseMode.list) {
      prevState.list.push(result);
    } else if (prevMode === ParseMode.set) {
      prevState.add(result);
    } else if (prevMode === ParseMode.map) {
      if (prevState[1].length > 0) {
        prevState[0].set(prevState[1].pop(), result);
      } else {
        prevState[1].push(result);
      }
    }
  //   // TODO: Else error
    result = undefined;
  }

  const match = () => {
    if (state === 'nil') {
  result = null;
}
else if (state === 'true') {
  result = true;
}
else if (state === 'false') {
  result = false;
}else if (intRegex.test(state)) {
  result = parseInt(state, 10);
}else if (floatRegex.test(state)) {
  result = parseFloat(state);
}else if (state[0] === ':') {
  result = { key: state.substr(1) };
}else if (state !== '') {
  result = { sym: state };
}
  state =''
}

  for (const char of edn.split('')) {
    if (mode === ParseMode.idle) {
				if (char === '"') {
				mode = ParseMode.string;
				state = '';
				continue;
			}
      if (spaceChars.includes(char)) {
        match()
        updateStack()
        continue
      }
      if (char === '}') {
        match()
        updateStack()
        const [prevMode, prevState] = stack.pop();
        if (prevMode === ParseMode.map) {
          // TODO: What if map is closed too early?
          result = prevState[0];
        } else {
          result = prevState;
        }
        updateStack()
        continue;
      }
      if (char === ']') {
        match()
        updateStack()
        const [prevMode, prevState] = stack.pop();
        result = prevState;
        updateStack()
        continue;
      }
      if (char === ')') {
        match()
        updateStack()
        const [prevMode, prevState] = stack.pop();
        result = prevState;
        updateStack()
        continue;
      }
			if (char === '[') {
				stack.push([ParseMode.vector, []]);
				continue;
			} else
			if (char === '(') {
				stack.push([ParseMode.list, { list: [] }]);
				continue;
			}

      state += char;

			if (state === '{') {
				stack.push([ParseMode.map, [new Map(), []]]);
        state = ''
			} else if (state === '#{') {
        stack.push([ParseMode.set, new Set()]);
        state = ''
      }
        continue;
    }else if (mode === ParseMode.string) {
      if (char === '\\') {
        stack.push([mode, state]);
        mode = ParseMode.escape;
        state = ''
        continue;
      }
      if (char === '"') {
        mode = ParseMode.idle;
				result = state
        updateStack()
        state = ''
        continue;
      }
      state += char;
    }else if (mode === ParseMode.escape) {
      // TODO what should happen when escaping other char
      const escapedChar = stringEscapeMap[char];
      const [prevMode, prevState] = stack.pop();
      mode = prevMode;
      state = prevState + escapedChar;
    }
  }

  if (result === undefined) {
  match()
  }
  return result;
};
