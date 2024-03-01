import { V8CpuProfileNode } from './types';

export function gcReparenting(samples: number[], nodes: V8CpuProfileNode[]) {
    const gcNode = nodes.find(node =>
        node.callFrame.functionName === '(garbage collector)'
    );

    if (gcNode === undefined) {
        return;
    }

    const gcNodeId = gcNode.id;
    const stackToGc = new Map();
    let id = 1 + nodes.reduce(
        (max, node) => node.id > max ? node.id : max,
        nodes[0].id
    );

    for (let i = 0, prevNodeId = -1; i < samples.length; i++) {
        const nodeId = samples[i];

        if (nodeId === gcNodeId) {
            if (prevNodeId === gcNodeId) {
                samples[i] = samples[i - 1];
            } else {
                if (stackToGc.has(prevNodeId)) {
                    samples[i] = stackToGc.get(prevNodeId);
                } else {
                    const parentNode = nodes[prevNodeId];
                    const newGcNodeId = id++;
                    const newGcNode = {
                        id: newGcNodeId,
                        callFrame: { ...gcNode.callFrame }
                    };

                    stackToGc.set(prevNodeId, newGcNodeId);
                    nodes.push(newGcNode);
                    samples[i] = newGcNodeId;

                    if (Array.isArray(parentNode.children)) {
                        parentNode.children.push(newGcNodeId);
                    } else {
                        parentNode.children = [newGcNodeId];
                    }
                }
            }
        }

        prevNodeId = nodeId;
    }
}

export function processSamples(samples: number[], nodeById: number[]) {
    // remap samples
    for (let i = 0; i < samples.length; i++) {
        samples[i] = nodeById[samples[i]];
    }
}
