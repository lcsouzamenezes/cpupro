import { locFromLineColumn } from './preprocessing/functions.js';
import {
    moduleTypeByWellKnownName,
    knownChromeExtensions,
    knownRegistry,
    maxRegExpLength,
    categories
} from './const.js';
import {
    CDN,
    CpuProCallFrame,
    CpuProCategory,
    CpuProFunction,
    CpuProFunctionKind,
    CpuProModule,
    CpuProPackage,
    CpuProScript,
    IScriptMapper,
    ModuleType,
    PackageRegistry,
    PackageType,
    V8CpuProfileCallFrame,
    WellKnownName
} from './types.js';
import { createScript, scriptFromScriptId } from './preprocessing/scripts.js';

type RegistryPackage = {
    type: PackageType;
    name: string;
    path: string;
    version: string | null;
    registry: PackageRegistry | null;
    cdn: CDN | null;
}

type CallFrameMap = Map<
    CpuProScript | null, // script
    Map<
        string, // function name
        Map<
            number, // line
            Map<
                number, // column
                number
            >
        >
    >
>;

export class Dictionary {
    scripts: CpuProScript[];
    callFrames: CpuProCallFrame[];
    functions: CpuProFunction[];
    modules: CpuProModule[];
    packages: CpuProPackage[];
    categories: CpuProCategory[];

    #modulesMap: Map<CpuProScript | string, CpuProModule>;
    #packagesMap: Map<string, CpuProPackage>;
    #categoriesMap: Map<string, CpuProCategory>;

    #scriptByUrl: Map<string, CpuProScript[]>;
    #callFramesByScript: CallFrameMap;
    #anonymousFunctionNameIndex: number = 1;
    #anonymousModuleByScriptId: Map<CpuProScript, string>;
    #packageNameByOriginMap: Map<string, string>;

    constructor() {
        this.scripts = [];
        this.callFrames = [];
        this.functions = [];
        this.modules = [];
        this.packages = [];
        this.categories = [];

        this.#modulesMap = new Map();
        this.#packagesMap = new Map();
        this.#categoriesMap = new Map();

        this.#scriptByUrl = new Map();
        this.#callFramesByScript = new Map();
        this.#anonymousModuleByScriptId = new Map();
        this.#packageNameByOriginMap = new Map([
            ...Object.entries(knownChromeExtensions)
        ]);

        // fulfill the category by known list to preserve an order
        for (const packageType of categories) {
            this.resolveCategory(packageType);
        }
    }

    reset() {}

    setPackageNameForOrigin(origin: string, packageName: string) {
        const existingPackageName = this.#packageNameByOriginMap.get(origin);

        if (existingPackageName === undefined) {
            this.#packageNameByOriginMap.set(origin, packageName);
        } else if (existingPackageName !== packageName) {
            console.warn(`Package name for origin "${origin}" already set "${existingPackageName}", new name "${packageName}" ignored`);
        }
    }

    resolveCallFrameIndex(inputCallFrame: V8CpuProfileCallFrame & { start?: number, end?: number }, mapper: IScriptMapper) {
        const functionName = inputCallFrame.functionName || '';
        const lineNumber = normalizeLoc(inputCallFrame.lineNumber);
        const columnNumber = normalizeLoc(inputCallFrame.columnNumber);
        const url = inputCallFrame.url || null;
        const script = scriptFromScriptId(inputCallFrame.scriptId, url, mapper);

        // resolve a callFrame through a chain of maps
        let byFunctionNameMap = this.#callFramesByScript.get(script);
        if (byFunctionNameMap === undefined) {
            this.#callFramesByScript.set(script, byFunctionNameMap = new Map());
        }

        let byLineNumberMap = byFunctionNameMap.get(functionName);
        if (byLineNumberMap === undefined) {
            byFunctionNameMap.set(functionName, byLineNumberMap = new Map());
        }

        let resultMap = byLineNumberMap.get(lineNumber);
        if (resultMap === undefined) {
            byLineNumberMap.set(lineNumber, resultMap = new Map());
        }

        let callFrameIndex = resultMap.get(columnNumber);
        if (callFrameIndex === undefined) {
            const start = normalizeLoc(inputCallFrame.start);
            const end = normalizeLoc(inputCallFrame.end);
            const fn = this.createFunction(script, functionName, lineNumber, columnNumber);
            const callFrame: CpuProCallFrame = {
                id: this.callFrames.length + 1,
                script,
                kind: fn.kind,
                name: fn.name,
                line: lineNumber,
                column: columnNumber,
                loc: locFromLineColumn(lineNumber, columnNumber),
                start,
                end,
                regexp: fn.regexp,
                category: fn.category,
                package: fn.package,
                module: fn.module,
                function: fn
            };

            callFrameIndex = this.callFrames.push(callFrame) - 1;
            resultMap.set(columnNumber, callFrameIndex);

            script?.callFrames.push(callFrame);
            this.functions.push(fn);
        }

        return callFrameIndex;
    }
    resolveCallFrame(inputCallFrame: V8CpuProfileCallFrame & { start?: number, end?: number }, mapper: IScriptMapper) {
        return this.callFrames[this.resolveCallFrameIndex(inputCallFrame, mapper)];
    }

    resolveScript(
        scriptId: number,
        mapper: IScriptMapper,
        url: string | null = null,
        source: string | null = null
    ): CpuProScript | null {
        if (scriptId === 0) {
            return null;
        }

        let script = mapper.get(scriptId);

        url ||= '';

        if (script === undefined) {
            const scriptIndexByUrl = mapper.getScriptIndexByUrl(scriptId, url);

            // FIXME: this is not fully a cross profile solution,
            // must take into account the source if provided
            let scriptByUrl = this.#scriptByUrl.get(url);
            if (scriptByUrl === undefined) {
                scriptByUrl = [];
                this.#scriptByUrl.set(url, scriptByUrl);
            }

            if (scriptIndexByUrl < scriptByUrl.length) {
                script = scriptByUrl[scriptIndexByUrl];
            } else {
                script = createScript(this.scripts.length + 1, url, source);
                scriptByUrl.push(script);
                this.scripts.push(script);
            }

            mapper.set(scriptId, script);
        }

        return script;
    }

    resolveCategory(packageType: PackageType): CpuProCategory {
        const name = packageType === 'webpack/runtime'
            ? 'script'
            : packageType;
        let category = this.#categoriesMap.get(name);

        if (category === undefined) {
            category = {
                id: this.#categoriesMap.size + 1,
                name
            };

            this.#categoriesMap.set(name, category);
            this.categories.push(category);
        }

        return category;
    }

    resolvePackage(
        moduleType: ModuleType,
        modulePath: string | null
    ): CpuProPackage {
        const canonicalRef = `${moduleType}/${modulePath}`;
        let pkg = this.#packagesMap.get(canonicalRef);

        if (pkg !== undefined) {
            return pkg;
        }

        let ref = 'unknown';
        let type: PackageType = 'unknown';
        let name = '(unknown)';
        let path: string | null = null;
        let version: string | null = null;
        let registry: PackageRegistry | null = null;
        let cdn: CDN | null = null;

        modulePath = modulePath || '';

        switch (moduleType) {
            case 'script':
            case 'bundle': {
                const packageRegistryInfo = resolveRegistryPackage(modulePath);

                if (packageRegistryInfo !== null) {
                    ref = packageRegistryInfo.path;
                    type = packageRegistryInfo.type;
                    name = packageRegistryInfo.name;
                    path = packageRegistryInfo.path;
                    version = packageRegistryInfo.version;
                    registry = packageRegistryInfo.registry;
                    cdn = packageRegistryInfo.cdn;
                }

                if (ref === 'unknown') {
                    type = 'script';

                    if (/^https?:/.test(modulePath)) {
                        const { origin, host } = new URL(modulePath);

                        ref = origin;
                        name = this.#packageNameByOriginMap.get(host) || host;
                        path = origin;
                    } else if (modulePath) {
                        const protocolMatch = modulePath.match(/^[a-z\d]{2,}:/i) || ['file:'];
                        const protocol = protocolMatch[0];

                        if (protocol !== 'file:') {
                            ref = `(${protocol}script)`;
                            name = ref;
                            path = protocol;
                        } else {
                            ref = '(script)';
                            name = ref;
                            path = modulePath.slice(0, modulePath.indexOf(':') + 1);
                        }
                    } else {
                        ref = '(compiled script)';
                        name = '(compiled script)';
                    }
                }

                break;
            }

            case 'regexp': {
                ref = '(regexp)';
                type = 'regexp';
                name = '(regexp)';
                path = '';

                break;
            }

            case 'node': {
                ref = '(node)';
                type = 'node';
                name = '(node.js modules)';
                path = 'node:';

                break;
            }

            case 'deno': {
                ref = '(deno)';
                type = 'deno';
                name = '(deno modules)';
                path = 'ext:';

                break;
            }

            // case 'blink':
            case 'v8': {
                ref = `(${moduleType})`;
                type = 'internals';
                name = `(${moduleType} modules)`;
                path = `${moduleType}/`;

                break;
            }

            case 'webpack/runtime':
            case 'electron': {
                ref = `(${moduleType})`;
                type = moduleType;
                name = `(${moduleType} modules)`;
                path = `${moduleType}/`;

                break;
            }

            case 'wasm': {
                ref = '(wasm)';
                type = 'wasm';
                name = '(wasm)';
                path = modulePath.startsWith('wasm://wasm/')
                    ? 'wasm://wasm/'
                    : null;

                break;
            }

            case 'chrome-extension': {
                const { origin, host } = new URL(modulePath);

                ref = origin;
                type = 'chrome-extension';
                name = this.#packageNameByOriginMap.get(host) || host;
                path = origin;

                break;
            }

            case 'root':
            case 'program':
            case 'gc':
            case 'idle':
            case 'internals':
            case 'compilation':
            case 'blocking':
                ref = moduleType;
                type = moduleType;
                name = moduleType !== 'gc' ? `(${moduleType})` : '(garbage collector)';
                break;
        }

        pkg = this.#packagesMap.get(ref);

        if (pkg === undefined) {
            pkg = {
                id: this.packages.length + 1,
                type,
                name,
                path,
                version,
                registry,
                cdn,
                category: this.resolveCategory(type)
            };

            this.#packagesMap.set(canonicalRef, pkg);
            this.#packagesMap.set(ref, pkg);
            this.packages.push(pkg);
        }

        return pkg;
    }

    #resolveModule(type: ModuleType, name: string | null, path: string | null = null, script: CpuProScript | null = null) {
        const moduleKey = script ?? name as string;
        let module = this.#modulesMap.get(moduleKey);

        if (module === undefined) {
            const pkg = this.resolvePackage(type, path);

            module = {
                id: this.#modulesMap.size + 1, // starts with 1
                type,
                name,
                path,
                script,
                category: pkg.category,
                package: pkg,
                packageRelPath: null
            };

            this.#modulesMap.set(moduleKey, module);
            this.modules.push(module);
        }

        return module;
    }

    resolveNoScriptModuleByFunctionName(functionName: string): CpuProModule {
        const wellKnownModuleType = moduleTypeByWellKnownName.get(functionName as WellKnownName) || null;
        let type: ModuleType = 'unknown';
        let name: string = 'unknown';

        if (wellKnownModuleType !== null) {
            type = wellKnownModuleType;
            name = functionName;
        } else {
            if (functionName.startsWith('RegExp: ')) {
                type = 'regexp';
                name = '(regexp)';
            } else {
                type = 'internals';
                name = '(internals)';
            }
        }

        return this.#resolveModule(type, name);
    }

    resolveModuleByScript(
        script: CpuProScript
    ) {
        let url = script.url;
        let type: ModuleType = 'unknown';
        let name: string | null = null;
        let path: string | null = null;

        // Edge produces call frames with extensions::SafeBuiltins as url for some reasons,
        // ignore such urls - treat as internals
        if (url === 'extensions::SafeBuiltins') {
            url = '';
        }

        if (!url || url.startsWith('evalmachine.')) {
            let anonymousName = this.#anonymousModuleByScriptId.get(script);

            if (anonymousName === undefined) {
                this.#anonymousModuleByScriptId.set(
                    script,
                    anonymousName = `(anonymous module #${this.#anonymousModuleByScriptId.size + 1})`
                );
            }

            type = 'script';
            name = anonymousName;
        } else if (url.startsWith('v8/')) {
            type = 'v8';
            path = url;
        } else if (url.startsWith('node:electron/') || url.startsWith('electron/')) {
            type = 'electron';
            path = url;
        } else if (url.startsWith('webpack/runtime/')) {
            type = 'webpack/runtime';
            path = url;
        } else {
            let protocol = (url.match(/^([a-z\-]+):/i) || [])[1] || '';

            if (protocol.length === 1 && /[A-Z]/.test(protocol)) {
                protocol = '';
                url = url.slice(2).replace(/\\/g, '/');
            }

            switch (protocol) {
                case '':
                    type = 'script';
                    path = 'file://' + url;
                    break;

                case 'file':
                case 'http':
                case 'https':
                    type = 'script';
                    path = url;
                    break;

                case 'webpack':
                case 'webpack-internal':
                    type = 'bundle';
                    path = url.replace(/\?$/, '');
                    break;

                case 'node':
                case 'chrome-extension':
                case 'wasm':
                    type = protocol;
                    path = url;
                    break;

                case 'ext':
                    if (/^ext:(core|cli|runtime|deno)/.test(url)) {
                        type = 'deno';
                        path = url;
                        break;
                    }

                default:
                    type = `protocol-${protocol}`;
                    name = url;
            }
        }

        return this.#resolveModule(type, name, path, script);
    }

    resolveModule(script: CpuProScript | null, functionName: string | null = null) {
        return script === null
            ? this.resolveNoScriptModuleByFunctionName(functionName || '')
            : this.resolveModuleByScript(script);
    }

    createFunction(
        script: CpuProScript | null,
        functionName: string,
        lineNumber: number,
        columnNumber: number
    ) {
        const module = this.resolveModule(script, functionName);
        const isRegExp = module.package.type === 'regexp';
        const regexp = isRegExp ? functionName.slice('RegExp: '.length) : null;
        const name = regexp
            ? (regexp.length <= maxRegExpLength ? regexp : `${regexp.slice(0, maxRegExpLength - 1)}…`)
            : functionName || (lineNumber === 0 && columnNumber === 0
                ? '(script)'
                : `(anonymous function #${this.#anonymousFunctionNameIndex++})`
            );

        const fn: CpuProFunction = {
            id: this.functions.length + 1, // id starts with 1
            name,
            script,
            category: module.category,
            package: module.package,
            module,
            kind: resolveFunctionKind(script, name, regexp),
            regexp,
            loc: locFromLineColumn(lineNumber, columnNumber)
        };

        return fn;
    }
}

function resolveRegistryPackage(modulePath: string): RegistryPackage | null {
    const moduleUrl = /^https?:\/\//.test(modulePath) ? new URL(modulePath) : null;

    if (moduleUrl !== null && Object.hasOwn(knownRegistry, moduleUrl.origin)) {
        const registry = knownRegistry[moduleUrl.origin];
        const registryPath = moduleUrl.pathname;

        for (const endpoint of registry.endpoints) {
            const packageMatch = registryPath.match(endpoint.pattern);

            if (packageMatch !== null) {
                const packageName = packageMatch.groups?.pkg || '?';
                const version = packageMatch.groups?.version || null;
                const pathOffset = packageMatch.indices?.groups?.path?.[0] ?? registryPath.length;

                return {
                    type: 'script',
                    name: packageName,
                    path: moduleUrl.origin + (pathOffset !== undefined ? registryPath.slice(0, pathOffset) : registryPath),
                    version,
                    registry: endpoint.registry,
                    cdn: registry.cdn
                };
            }
        }
    }

    if (/\/node_modules\//.test(modulePath)) {
        // use a Node.js path convention
        const pathParts = modulePath.split(/\/node_modules\//);
        const pathLastPart = pathParts.pop() || '';
        const npmPackageNameMatch = pathLastPart.match(/(?:@[^/]+\/)?[^/]+/);

        if (npmPackageNameMatch !== null) {
            const npmPackageName = npmPackageNameMatch[0];
            const npmPackagePath = [...pathParts, npmPackageName].join('/node_modules/');

            return {
                type: 'script',
                name: npmPackageName,
                path: npmPackagePath,
                version: null,
                registry: 'npm',
                cdn: null
            };
        }
    }

    return null;
}

function normalizeLoc(value: unknown) {
    return typeof value === 'number' && value >= 0 ? value : -1;
}

function resolveFunctionKind(script: CpuProScript | null, name: string, regexp: string | null): CpuProFunctionKind {
    if (script === null) {
        if (name === '(root)') {
            return 'root';
        }

        if (Object.hasOwn(moduleTypeByWellKnownName, name)) {
            return 'vm-state';
        }
    }

    if (regexp !== null) {
        return 'regexp';
    }

    if (name === '(script)') {
        return 'script';
    }

    return 'function';
}
