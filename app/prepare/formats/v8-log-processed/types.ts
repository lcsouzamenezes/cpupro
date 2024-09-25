export type V8LogProfile = {
    code: V8LogCode[];
    ticks: V8LogTick[];
    functions: V8LogFunction[];
    scripts: V8LogScripts;
    heap?: {
        available: null | number;
        capacity: null | number;
        events: V8LogHeapEvent[];
    };
}

export type V8LogCode = {
    name: string;
    type: 'CODE' | 'CPP' | 'JS' | 'SHARED_LIB';
    kind?:
        | 'Bultin'
        | 'BytecodeHandler'
        | 'Handler'
        | 'KeyedLoadIC'
        | 'KeyedStoreIC'
        | 'LoadGlobalIC'
        | 'LoadIC'
        | 'Opt'
        | 'StoreIC'
        | 'Stub'
        | 'Unopt'
        | 'Ignition'
        | 'Baseline'
        | 'Sparkplug'
        | 'Maglev'
        | 'Turboprop'
        | 'Turbofan'
        | 'Builtin'
        | 'RegExp';
    func?: number;
    tm?: number;
    source?: V8LogCodeSource;
    deopt?: V8LogDeopt;
}

export type V8LogCodeSource = {
    script: number;
    start: number;
    end: number;
    positions: string;
    inlined: string;
    fns: number[];
}

export type V8LogDeopt = {
    tm: number;
    inliningId: number;
    scriptOffset: number;
    posText: string;
    reason: string;
    bailoutType: string;
}

export type V8LogFunction = {
    name: string;
    codes: number[];
}

export type V8LogTick = {
    tm: number;  // timestamp
    vm: number;  // vm state
    s: number[]; // stack
}

export type V8LogScripts = (V8LogScript | null)[];
export type V8LogScript = {
    id: number;
    url: string;
    source: string;
}

export type V8LogHeapEvent = {
    tm: number;
    event: 'new' | 'delete';
    address: string;
    size: number;
}

// Output

export type CallFrame = {
    scriptId: number;
    functionName: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
}

export type CallNode = {
    id: number;
    callFrame: CallFrame;
    children: number[];
    parentScriptOffset: number;
}
