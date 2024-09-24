discovery.page.define('functions', [
    {
        view: 'context',
        data: `
            functionsTimings.entries.zip(=> entry, scriptFunctions, => function)
                .({
                    $entry: left.entry;

                    ...,
                    $entry,
                    name: $entry.name,
                    moduleName: $entry.module.name,
                    loc: $entry.loc,
                    selfTime: left.selfTime,
                    nestedTime: left.nestedTime,
                    totalTime: left.totalTime
                })
        `,
        modifiers: [
            {
                view: 'page-header',
                className: 'all-page-header',
                prelude: [
                    'badge{ text: "Packages", className: #.page = "packages" ? "selected", href: #.page != "packages" ? "#packages" }',
                    'badge{ text: "Modules", className: #.page = "modules" ? "selected", href: #.page != "modules" ? "#modules" }',
                    'badge{ text: "Functions", className: #.page = "functions" ? "selected", href: #.page != "functions" ? "#functions" }'
                ],
                content: [
                    'h1:"All functions"',
                    {
                        view: 'input',
                        name: 'filter',
                        type: 'regexp',
                        placeholder: 'Filter'
                    }
                ]
            }
        ],
        content: {
            view: 'context',
            data: '.[name ~= #.filter]',
            content: [
                {
                    view: 'table',
                    className: 'all-page-table',
                    limit: 50,
                    data: '.sort(selfTime desc, totalTime desc)',
                    cols: [
                        { header: 'Self time',
                            sorting: 'selfTime desc, totalTime desc',
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
                            sorting: 'nestedTime desc, totalTime desc',
                            when: 'totalTime',
                            content: 'duration:{ time: nestedTime, total: #.data.totalTime }'
                        },
                        { header: 'Total time',
                            sorting: 'totalTime desc, selfTime desc',
                            when: 'totalTime',
                            content: 'duration:{ time: totalTime, total: #.data.totalTime }'
                        },
                        { header: 'Kind',
                            content: 'function-kind-badge:entry.kind'
                        },
                        // { header: 'Function',
                        //     data: 'left.entry',
                        //     sorting: 'name ascN',
                        //     content: {
                        //         view: 'auto-link',
                        //         content: 'text-match:{ text, match: #.filter }'
                        //     }
                        // },
                        { header: 'Function',
                            sorting: 'name ascN',
                            content: {
                                view: 'badge',
                                data: 'entry.marker() | { text: title, href, match: #.filter }',
                                content: 'text-match'
                            }
                        },
                        { header: 'Module',
                            sorting: 'moduleName ascN, loc ascN',
                            data: 'entry',
                            content: [
                                'module-badge:module',
                                'loc-badge'
                            ]
                        },
                        { header: 'Source',
                            className: 'number',
                            sorting: '(right.end - right.start) desc',
                            data: 'right',
                            content: 'text:end - start | $ > 0?: ""',
                            details: '=end-start > 0 ? `source:{ syntax: "js", content: script.source[start:end] }`'
                        },
                        { header: 'States',
                            sorting: 'right.states.size() desc',
                            data: 'right',
                            content: {
                                view: 'inline-list',
                                data: 'states.([[tier.abbr() + "\xa0"]])',
                                whenData: true
                            }
                        }
                    ]
                },

                {
                    view: 'block',
                    className: 'app-page-summary',
                    content: [
                        { view: 'block', content: ['text:"Functions:"', 'text-numeric:size()'] },
                        { view: 'block', content: ['text:"Total time:"', 'duration:{ time: sum(=>selfTime), total: #.data.totalTime }'] }
                    ]
                }
            ]
        }
    }
]);
