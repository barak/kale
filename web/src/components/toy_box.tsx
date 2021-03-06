import { useTheme } from "styled-components";
import React, { useState } from "react";

import * as E from "expr";
import { Category } from "vm/types";
import { groupEntries, assert } from "utils";
import { Stack } from "components";
import { useContextChecked } from "hooks";
import Builtins from "vm/builtins";
import Expr, { exprData } from "expr";
import Clipboard from "state/clipboard";

import ExprViewList, { ShortcutExpr } from "components/expr_view_list";
import Pane from "components/pane";

import EditorStack from "contexts/editor_stack";
import SegmentButton from "./segment_button";
import { useDispatch } from "react-redux";

function createToyBox(): Readonly<{ [category in Category]: ShortcutExpr[] }> {
    function blank(comment: string) {
        return new E.Blank(E.exprData(comment));
    }

    const exprs: [Category, Expr][] = [
        [Category.General, new E.List([blank("First Line"), blank("Second Line")])],
        [Category.General, new E.Call("If", [blank("If True"), blank("If False")])],
        [Category.General, new E.Call("While", [blank("Condition"), blank("Do Something")])],
        [Category.General, new E.Call("Let", [new E.Variable("Variable"), blank("Value")])],
        [Category.General, new E.Call("Set", [new E.Variable("Variable"), blank("Value")])],
    ];
    for (const [fn, value] of Object.entries(Builtins)) {
        const { args, category } = value.value;
        if (category === undefined) continue;
        const blanks = args.map((x) => new E.Blank(exprData(x)));
        exprs.push([category, new E.Call(fn, blanks)]);
    }
    return groupEntries(exprs.map(([cat, expr]) => [cat, { expr, persistent: true }]));
}

const toyBoxExprs = createToyBox();
export default React.memo(function ToyBox() {
    const theme = useTheme();
    const editorStack = useContextChecked(EditorStack);
    const dispatch = useDispatch();
    const [category, setCategory] = useState(Category.General);

    function onContextMenu(item: ShortcutExpr) {
        return [
            {
                id: "open",
                label: "Open Definition",
                keyEquivalent: "o",
                action() {
                    assert(item.expr instanceof E.Call);
                    editorStack.openEditor(item.expr.fn);
                },
            },
            {
                id: "copy",
                label: "Copy",
                keyEquivalent: "c",
                action() {
                    dispatch(Clipboard.actions.add({ expr: item.expr, pinned: false }));
                },
            },
        ];
    }

    if (!theme.feature.toyBox) return null;
    return (
        <Pane name="Blocks">
            <Stack gap={20} marginTop="" alignItems="start">
                <SegmentButton
                    vertical
                    labels={Object.keys(Category)}
                    active={category}
                    onClick={(label) => setCategory(label as Category)}
                />
                <ExprViewList
                    items={toyBoxExprs[category]}
                    width={200}
                    scale={0.9}
                    onMiddleClick={(item) => {
                        if (item.expr instanceof E.Call) editorStack.openEditor(item.expr.fn);
                    }}
                    onContextMenu={onContextMenu}
                />
            </Stack>
        </Pane>
    );
});
