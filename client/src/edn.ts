// TODO: support chars
// TODO: support bigint
// TODO: support comment
// TODO: support discard
// TODO: separate generation and parsing into files
// TODO: keywords should contain a single slash
// TODO: Can you tag a tagged val?
// TODO: keywords and symbols need some care with characters
// TODO: tag if not one of the well known must contain exactly one slash
// TODO: What happens with empty doc
// TODO: Error when wrong closing tag
// TODO: Streaming maybe
// TODO: parse options: keywordAsString, mapAsObject

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
export type EDNMap = { map: [EDNVal, EDNVal][] };
export type EDNVector = EDNVal[];
export type EDNSet = { set: EDNVal[] };
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

const isEDNMap = (
  value: Record<string, EDNVal | [EDNVal, EDNVal][]>,
): value is EDNMap => {
  return value.map !== undefined;
};

const isEDNSet = (
  value: Record<string, EDNVal | EDNVal[]>,
): value is EDNSet => {
  return value.set !== undefined;
};

const isEDNList = (
  value: Record<string, EDNVal | EDNVal[]>,
): value is EDNList => {
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

  if (Array.isArray(value)) {
    return `[${value.map(toEDNString).join(' ')}]`;
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  if (typeof value === 'boolean') {
    return JSON.stringify(value);
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

  if (isEDNMap(value)) {
    return `{${value.map
      .map(([k, v]: [EDNVal, EDNVal]) => `${toEDNString(k)} ${toEDNString(v)}`)
      .join(' ')}}`;
  }

  if (isEDNSet(value)) {
    return `#{${value.set.map(toEDNString).join(' ')}}`;
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
}
enum StackItem {
  vector,
  list,
  map,
  set,
  tag,
}
const stringEscapeMap = {
  t: '\t',
  r: '\r',
  n: '\n',
  '\\': '\\',
  '"': '"',
};
const spaceChars = [',', ' ', '\t', '\n', '\r'];
const intRegex = /^[-+]?(0|[1-9][0-9]*)$/;
const floatRegex = /^[-+]?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?(0|[1-9][0-9]*))?M?$/;

export const parseEDNString = (
  edn: string,
  { mapAsObject = false, keywordAsString = false } = {},
): EDNVal | { [key: string]: EDNVal } => {
  const stack = [];
  let mode = ParseMode.idle;
  let state = '';
  let result: EDNVal | undefined;

  const updateStack = () => {
    if (stack.length === 0 || result === undefined) {
      return;
    }
    const [stackItem, prevState] = stack[stack.length - 1];
    if (stackItem === StackItem.vector) {
      prevState.push(result);
    } else if (stackItem === StackItem.list) {
      prevState.push(result);
    } else if (stackItem === StackItem.set) {
      prevState.push(result);
    } else if (stackItem === StackItem.map) {
      if (prevState[1].length > 0) {
        prevState[0].push([prevState[1].pop(), result]);
      } else {
        prevState[1].push(result);
      }
    } else if (stackItem === StackItem.tag) {
      stack.pop();
      if (prevState === 'inst') {
        // TODO: what if invalid date?
        result = new Date(result as string);
        return;
      }
      result = { tag: prevState, val: result };
      return;
    }
    //   // TODO: Else error
    result = undefined;
  };

  const match = () => {
    if (state === 'nil') {
      result = null;
    } else if (state === 'true') {
      result = true;
    } else if (state === 'false') {
      result = false;
    } else if (state[0] === ':') {
      result = keywordAsString ? state.substr(1) : { key: state.substr(1) };
    } else if (state[0] === '#') {
      stack.push([StackItem.tag, state.substr(1)]);
      result = undefined;
    } else if (intRegex.test(state)) {
      result = parseInt(state, 10);
    } else if (floatRegex.test(state)) {
      result = parseFloat(state);
    } else if (state !== '') {
      result = { sym: state };
    }
    state = '';
  };

  for (let i = 0; i < edn.length; i++) {
    const char = edn[i];
    // for (const char of edn.split('')) {
    if (mode === ParseMode.idle) {
      if (char === '"') {
        mode = ParseMode.string;
        state = '';
        continue;
      }
      if (spaceChars.includes(char)) {
        match();
        updateStack();
        continue;
      }
      if (char === '}') {
        match();
        updateStack();
        const [stackItem, prevState] = stack.pop();
        if (stackItem === StackItem.map) {
          // TODO: What if map is closed too early?
          if (mapAsObject) {
            // TODO: what if map has non-stringable keys? keys as JSON?
            result = prevState[0].reduce((memo, [k, v]) => {
              return { ...memo, [k]: v };
            }, {});
          } else {
            result = { map: prevState[0] };
          }
        } else {
          result = { set: prevState };
        }
        updateStack();
        continue;
      }
      if (char === ']') {
        match();
        updateStack();
        const [stackItem, prevState] = stack.pop();
        result = prevState;
        updateStack();
        continue;
      }
      if (char === ')') {
        match();
        updateStack();
        const [stackItem, prevState] = stack.pop();
        result = { list: prevState };
        updateStack();
        continue;
      }
      if (char === '[') {
        stack.push([StackItem.vector, []]);
        continue;
      } else if (char === '(') {
        stack.push([StackItem.list, []]);
        continue;
      }

      state += char;

      if (state === '{') {
        stack.push([StackItem.map, [[], []]]);
        state = '';
      } else if (state === '#{') {
        stack.push([StackItem.set, []]);
        state = '';
      }
      continue;
    } else if (mode === ParseMode.string) {
      if (char === '\\') {
        stack.push([mode, state]);
        mode = ParseMode.escape;
        state = '';
        continue;
      }
      if (char === '"') {
        mode = ParseMode.idle;
        result = state;
        updateStack();
        state = '';
        continue;
      }
      state += char;
    } else if (mode === ParseMode.escape) {
      // TODO what should happen when escaping other char
      const escapedChar = stringEscapeMap[char];
      const [stackItem, prevState] = stack.pop();
      mode = stackItem;
      state = prevState + escapedChar;
    }
  }

  if (result === undefined) {
    match();
    // while (stack.length > 0){
    updateStack();
    // }
  }
  return result;
};
