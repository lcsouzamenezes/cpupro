const pageContent = [
    {
        view: 'page-header',
        prelude: [
            'badge{ className: "type-badge", text: "Module" }',
            'badge{ className: "category-badge", text: category.name, href: category.marker().href, color: category.name.color() }',
            'package-badge'
        ],
        content: 'h1:packageRelPath or name or path'
    },

    {
        view: 'subject-with-nested-timeline',
        data: '{ subject: @, tree: #.currentProfile.modulesTree }'
    },

    {
        view: 'update-on-timings-change',
        timings: '=#.currentProfile.modulesTimingsFiltered',
        content: {
            view: 'page-indicator-timings',
            data: `{
                full: #.currentProfile.modulesTimings.entries[=>entry = @],
                filtered: #.currentProfile.modulesTimingsFiltered.entries[=>entry = @]
            }`
        }
    },

    {
        view: 'expand',
        when: false,
        className: 'trigger-outside script-source',
        data: '#.currentProfile.codesByScript[=> script = @.script]',
        expanded: '=script.source is not undefined',
        header: [
            'text:"Source"',
            { view: 'switch', content: [
                { when: 'script.source is not undefined', content: 'html:` \xa0<span style="color: #888">${script.source.size().bytes(true)}</html>`' },
                { content: 'html:` <span style="color: #888">(unavailable)</span>`' }
            ] }
        ],
        content: {
            view: 'source',
            data: `{
                $tooltipView: [
                    'text:scriptFunction.callFrame.name',
                    'html:"<br>"',
                    {
                        view: 'inline-list',
                        data: 'scriptFunction.codes',
                        item: 'text:"\xa0→ " + tier + (inlined ? " (inlined: " + fns.size() + ")" : "")'
                    }
                ];

                syntax: "js",
                content: script.source | is string ? replace(/\\n$/, "") : "// source is unavailable",
                refs: callFrameCodes.({
                    $href: callFrame.marker('call-frame').href;
                    $marker: codes | size() = 1
                        ? tier[].abbr()
                        : size() <= 3
                            ? tier.(abbr()).join(' ')
                            : tier[].abbr() + ' … ' + tier[-1].abbr();

                    className: 'function',
                    range: [callFrame.start, callFrame.end],
                    marker: $href ? $marker + '" data-href="' + $href : $marker,
                    scriptFunction: $,
                    tooltip: $tooltipView
                })
            }`,
            postRender(el) {
                const contentEl = el.querySelector('.view-source__content');

                contentEl.addEventListener('click', (event) => {
                    const pseudoLinkEl = event.target.closest('.view-source .spotlight[data-href]');

                    if (pseudoLinkEl && contentEl.contains(pseudoLinkEl)) {
                        discovery.setPageHash(pseudoLinkEl.dataset.href);
                    }
                });
            }
        }
    },

    {
        view: 'expand',
        expanded: true,
        className: 'trigger-outside',
        header: 'text:"Nested time distribution"',
        content: 'nested-timings-tree:{ subject: @, tree: #.currentProfile.modulesTree, timings: #.currentProfile.modulesTimingsFiltered }'
    },

    {
        view: 'expand',
        expanded: true,
        className: 'trigger-outside',
        header: [
            'text:"Call frames "',
            {
                view: 'pill-badge',
                data: '#.currentProfile.callFramesTimingsFiltered.entries.[entry.module = @]',
                content: [
                    {
                        view: 'update-on-timings-change',
                        timings: '=#.currentProfile.callFramesTimingsFiltered',
                        content: 'text-numeric:count(=> totalTime?)'
                    },
                    {
                        view: 'text-numeric',
                        className: 'total-number',
                        data: '` ⁄ ${size()}`'
                    }
                ]
            }
        ],
        content: {
            view: 'content-filter',
            className: 'table-content-filter',
            data: `
                #.currentProfile.callFramesTimingsFiltered.entries.[entry.module = @]
                    .zip(=> entry, #.currentProfile.codesByCallFrame, => function)
                    .({
                        $entry: left.entry;

                        ...,
                        $entry,
                        name: $entry.name,
                        moduleName: $entry.module.name,
                        loc: $entry.loc
                    })
            `,
            content: {
                view: 'update-on-timings-change',
                timings: '=#.currentProfile.callFramesTimingsFiltered',
                content: {
                    view: 'table',
                    data: `
                        .[name ~= #.filter]
                        .({
                            ...,
                            selfTime: left.selfTime,
                            nestedTime: left.nestedTime,
                            totalTime: left.totalTime
                        })
                        .sort(selfTime desc, totalTime desc, loc ascN)
                    `,
                    cols: [
                        { header: 'Self time',
                            sorting: 'selfTime desc, totalTime desc, loc ascN',
                            colSpan: '=totalTime ? 1 : 3',
                            content: {
                                view: 'switch',
                                content: [
                                    { when: 'totalTime', content: 'duration:{ time: selfTime, total: #.data.totalTime }' },
                                    { content: 'no-samples' }
                                ]
                            }
                        },
                        { header: 'Nested time',
                            sorting: 'nestedTime desc, totalTime desc, loc ascN',
                            when: 'totalTime',
                            content: 'duration:{ time: nestedTime, total: #.data.totalTime }'
                        },
                        { header: 'Total time',
                            sorting: 'totalTime desc, selfTime desc, loc ascN',
                            when: 'totalTime',
                            content: 'duration:{ time: totalTime, total: #.data.totalTime }'
                        },
                        { header: 'Call frame',
                            sorting: 'name ascN',
                            content: 'auto-link{ data: entry, content: "text-match:{ ..., match: #.filter }" }'
                        },
                        { header: 'Loc',
                            sorting: 'loc ascN',
                            data: 'entry',
                            content: ['module-badge', 'call-frame-loc-badge']
                        }
                    ]
                }
            }
        }
    },

    {
        view: 'flamechart-expand',
        tree: '=#.currentProfile.modulesTree',
        timings: '=#.currentProfile.modulesTreeTimingsFiltered',
        value: '='
    }
];

discovery.page.define('module', {
    view: 'switch',
    context: '{ ...#, currentProfile }',
    data: 'currentProfile.modules[=>id = +#.id]',
    content: [
        { when: 'no $', content: {
            view: 'alert-warning',
            content: 'md:"No module with id \\"{{#.id}}\\" is found\\n\\n[Back to index page](#)"'
        } },
        { content: pageContent }
    ]
});
