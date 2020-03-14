import React, { Component, useContext } from "react";
import { useTheme } from "styled-components";
import produce from "immer";

import * as E from "expr";
import * as Select from "selection";
import Expr, { ExprId } from "expr";
import ExprView, { ExprAreaMap } from "expr_view";
import { Optional, assertSome, insertIndex, reverseObject, assert } from "utils";
import { Clipboard, ClipboardValue } from "contexts/clipboard";
import { Workspace, WorkspaceValue } from "contexts/workspace";
import { KaleTheme } from "theme";
import { Type, Func, Value, assertFunc } from "vm/types";

import { ContextMenuItem } from "components/context_menu";
import InlineEditor from "components/inline_editor";
import { specialFunctions } from "vm/interpreter";

interface EditorState {
    focused: boolean;
    selection: ExprId;
    foldingComments: boolean;
    editing: Optional<{ expr: Expr; value: string }>;
}

interface EditorWrapperProps {
    stealFocus?: boolean;
    topLevelName: string;
}

interface EditorProps extends EditorWrapperProps {
    workspace: WorkspaceValue;
    clipboard: ClipboardValue;
    theme: KaleTheme;
}

class Editor extends Component<EditorProps, EditorState> {
    private readonly containerRef = React.createRef<HTMLDivElement>();
    private readonly exprAreaMapRef = React.createRef<ExprAreaMap>();

    state: EditorState = {
        selection: this.expr.id,
        focused: this.props.stealFocus ?? false,
        foldingComments: false,
        editing: null,
    };

    private get expr(): Expr {
        const func = this.props.workspace.get(this.props.topLevelName);
        assert(func.type === Type.Func);
        return (func.value as Func).expr;
    }

    // Editor internal APIs.
    private update(child: Optional<ExprId>, updater: (expr: Expr) => Optional<Expr>) {
        this.props.workspace.update(
            this.props.topLevelName,
            expr =>
                expr.update(child ?? expr.id, updater) ??
                new E.Blank(E.exprData("Double click me")),
        );
    }

    private addToClipboard(expr: ExprId) {
        const selected = this.expr.withId(expr);
        if (selected) {
            this.props.clipboard.add({ expr: selected, pinned: false });
        }
    }

    private removeExpr(sel: ExprId) {
        this.update(sel, () => null);
    }

    private replaceExpr(old: ExprId, next: Expr) {
        this.update(old, () => next.resetIds().replaceId(old));
    }

    private stopEditing(insertArguments: boolean) {
        const { expr, value } = assertSome(this.state.editing);
        if (value === "") {
            this.replaceExpr(expr.id, new E.Blank());
        } else if (insertArguments) {
            // const args = this.props.workspace.
        }
        this.setState({ editing: null });
        this.focus();
    }

    private replaceAndEdit(expr: ExprId, next: Expr) {
        // Replace expr but using the callback.
        this.replaceExpr(expr, next);
        //TODO: Remove this.
        // ReplaceExpr will re-use the expr ID.
        this.forceUpdate(() => this.startEditing(expr));
    }

    private insertBlankAsSiblingOf(target: ExprId, right: boolean) {
        this.insertAsSiblingOf(target, new E.Blank(), right);
    }

    // Complex functions.
    private insertAsChildOf(target: ExprId, toInsert: Expr, last: boolean) {
        const insertion = last ? -1 : 0;
        this.update(target, parent => {
            if (parent instanceof E.Call) {
                this.exprSelected(toInsert.id);
                return new E.Call(
                    parent.fn,
                    produce(parent.args, draft => void draft.splice(insertion, 0, toInsert)),
                    parent.data,
                );
            } else if (parent instanceof E.List) {
                this.exprSelected(toInsert.id);
                return new E.List(
                    produce(parent.list, draft => void draft.splice(insertion, 0, toInsert)),
                    parent.data,
                );
            }
            return parent;
        });
    }

    private insertAsSiblingOf(sibling: ExprId, toInsert: Expr, right: boolean) {
        const currentParent = this.expr.parentOf(sibling)?.id;
        const ixDelta = right ? 1 : 0;

        if (currentParent == null) {
            this.update(null, main => new E.List(right ? [main, toInsert] : [toInsert, main]));
            this.exprSelected(toInsert.id);
            return;
        }

        this.update(currentParent, parent => {
            if (parent instanceof E.Call) {
                const ix = parent.args.findIndex(x => x.id === sibling);
                return new E.Call(
                    parent.fn,
                    produce(parent.args, draft => void draft.splice(ix + ixDelta, 0, toInsert)),
                    parent.data,
                );
            } else if (parent instanceof E.List) {
                const ix = parent.list.findIndex(x => x.id === sibling);
                return new E.List(
                    produce(parent.list, draft => void draft.splice(ix + ixDelta, 0, toInsert)),
                    parent.data,
                );
            }
            // Parent always has to be one of these.
            throw new E.UnvisitableExpr(parent);
        });
        this.exprSelected(toInsert.id);
    }

    // Actions.
    private selectionAction(reducer: Select.SelectFn): () => void {
        return () =>
            this.setState(state => ({
                selection:
                    reducer(this.expr, state.selection, assertSome(this.exprAreaMapRef.current)) ??
                    state.selection,
            }));
    }

    private pasteAction(ix: number): () => void {
        return () => {
            const clipboard = this.props.clipboard.clipboard;
            if (ix < clipboard.length) {
                this.replaceExpr(this.state.selection, clipboard[ix].expr);
                this.props.clipboard.use(clipboard[ix].expr.id);
            }
        };
    }

    private readonly smartSpace = (target: ExprId) => {
        const expr = this.expr.withId(target);
        if (expr instanceof E.Call || expr instanceof E.List) {
            this.insertAsChildOf(target, new E.Blank(), false);
        } else if (expr instanceof E.Blank) {
            // Kinda like slurp. We don't create a new blank, rather move this one around.
            const parent = this.expr.parentOf(target);
            if (parent != null) {
                // Do not stack top-level lists.
                if (this.expr.parentOf(parent.id) == null && this.expr instanceof E.List) return;
                this.removeExpr(target);
                this.insertAsSiblingOf(parent.id, expr, true);
            }
        } else {
            this.insertBlankAsSiblingOf(target, true);
        }
    };

    private readonly actions = {
        delete: (e: ExprId) => this.removeExpr(e),
        replace: (e: ExprId) => this.replaceExpr(e, new E.Blank()),
        move: (e: ExprId) => {
            this.addToClipboard(e);
            this.removeExpr(e);
        },
        shuffle: (e: ExprId) => {
            this.addToClipboard(e);
            this.replaceExpr(e, new E.Blank());
        },
        copy: (e: ExprId) => this.addToClipboard(e),
        append: (e: ExprId) => this.createChildBlank(e),
        insert: (e: ExprId) => this.insertBlankAsSiblingOf(e, true),
        insertBefore: (e: ExprId) => this.insertBlankAsSiblingOf(e, false),
        foldComments: () => this.setState(state => ({ foldingComments: !state.foldingComments })),
        comment: (e: ExprId) => {
            const selected = this.expr.withId(e);
            if (selected != null) {
                const comment = prompt("Comment?", selected.data.comment) ?? undefined;
                this.update(e, expr => expr.assignToData({ comment }));
            }
        },
        disable: (e: ExprId) => {
            this.update(e, expr => {
                if (expr instanceof E.Blank) return expr;
                return expr.assignToData({ disabled: !expr.data.disabled });
            });
        },
        edit: (e: ExprId) => this.startEditing(e),
        // Demo things that should be moved to the toy-box.
        demoAddCall: (e: ExprId) => this.replaceAndEdit(e, new E.Call("")),
        demoAddVariable: (e: ExprId) => this.replaceAndEdit(e, new E.Variable("")),
        demoAddString: (e: ExprId) => this.replaceAndEdit(e, new E.Literal("", Type.Str)),
    };

    // See https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values.
    // Keep these sorted.
    private readonly menuKeyEquivalents: { [key: string]: keyof Editor["actions"] } = {
        "/": "disable",
        "#": "foldComments",
        a: "append",
        c: "copy",
        d: "delete",
        Enter: "edit",
        f: "demoAddCall",
        g: "demoAddString",
        i: "insert",
        I: "insertBefore",
        m: "move",
        q: "comment",
        r: "replace",
        s: "shuffle",
        v: "demoAddVariable",
    };

    // The shortcuts only accessible from the keyboard.
    // Keep these sorted.
    private readonly editorShortcuts: { [key: string]: (sel: ExprId) => void } = {
        " ": this.smartSpace,
        "0": this.pasteAction(9),
        "1": this.pasteAction(0),
        "2": this.pasteAction(1),
        "3": this.pasteAction(2),
        "4": this.pasteAction(3),
        "5": this.pasteAction(4),
        "6": this.pasteAction(5),
        "7": this.pasteAction(6),
        "8": this.pasteAction(7),
        "9": this.pasteAction(9),
        ArrowDown: this.selectionAction(Select.downSmart),
        ArrowLeft: this.selectionAction(Select.leftSmart),
        ArrowRight: this.selectionAction(Select.rightSmart),
        ArrowUp: this.selectionAction(Select.upSmart),
        H: this.selectionAction(Select.leftSiblingSmart),
        h: this.selectionAction(Select.leftSmart),
        j: this.selectionAction(Select.downSmart),
        k: this.selectionAction(Select.upSmart),
        L: this.selectionAction(Select.rightSiblingSmart),
        l: this.selectionAction(Select.rightSmart),
        p: this.selectionAction(Select.parent),
        Tab: this.selectionAction(Select.nextBlank),
    };

    private readonly exprMenu: Optional<{ label: string; action: keyof Editor["actions"] }>[] = [
        { action: "edit", label: "Edit..." },
        { action: "copy", label: "Copy" },
        null,
        { action: "delete", label: "Delete" },
        { action: "move", label: "Delete and Copy" },
        { action: "replace", label: "Replace" },
        { action: "shuffle", label: "Replace and Copy" },
        null,
        { action: "append", label: "Add Argument" },
        { action: "insert", label: "New Line" },
        { action: "insertBefore", label: "New Line Before" },
        null,
        { action: "comment", label: "Comment..." },
        { action: "disable", label: "Disable" },
        { action: "foldComments", label: "Fold Comments" },
        null,
        { action: "demoAddCall", label: "Add a Call" },
        { action: "demoAddVariable", label: "Add a Variable" },
        { action: "demoAddString", label: "Add a String" },
    ];

    // Bound methods.
    private readonly menuKeyEquivalentForAction = reverseObject(this.menuKeyEquivalents);
    contextMenuFor = (expr: ExprId): ContextMenuItem[] => {
        return this.exprMenu.map((item, i) => ({
            id: item?.action ?? i.toString(),
            label: item?.label,
            action: item?.action && (() => this.actions[item.action](expr)),
            keyEquivalent: item?.action && this.menuKeyEquivalentForAction[item.action],
        }));
    };

    private readonly keyDown = (event: React.KeyboardEvent) => {
        // Do not handle modifier keys.
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        const key = event.key;
        if (Object.prototype.hasOwnProperty.call(this.menuKeyEquivalents, key)) {
            this.actions[this.menuKeyEquivalents[key]](this.state.selection);
            event.preventDefault();
        } else if (Object.prototype.hasOwnProperty.call(this.editorShortcuts, key)) {
            this.editorShortcuts[key](this.state.selection);
            event.preventDefault();
        } else {
            console.log("Did not handle", event.key);
        }
    };

    private readonly createChildBlank = (parentId: ExprId) => {
        this.insertAsChildOf(parentId, new E.Blank(), true);
    };

    private readonly exprSelected = (selection: ExprId) => {
        this.setState({ selection });
    };

    private readonly focusChanged = () => {
        this.setState({ focused: document.activeElement?.id === "editor" });
    };

    private readonly startEditing = (exprId: ExprId) => {
        const expr = this.expr.withId(exprId);
        const value = expr?.value();
        if (expr != null && value != null) {
            this.setState({ editing: { expr, value } });
        }
    };

    private readonly focus = () => {
        this.containerRef.current?.focus();
    };

    componentDidMount() {
        if (this.props.stealFocus) this.focus();
    }

    componentDidUpdate(prevProps: EditorProps) {
        assert(
            prevProps.topLevelName === this.props.topLevelName,
            "Use a key to create a new Editor component instead",
        );
        // This ensures the selection is always valid. Find the closest existing parent.
        if (!this.expr.contains(this.state.selection)) {
            const prevExpr = assertFunc(prevProps.workspace.get(prevProps.topLevelName)).expr;
            // Find the candidates for the next selection.
            const [siblings, ix] = prevExpr.siblings(this.state.selection);
            const candidates: Expr[][] = [];
            if (ix != null) {
                candidates.push(siblings.slice(ix + 1));
                candidates.push(siblings.slice(0, ix));
            }
            candidates.push(prevExpr.parents(this.state.selection));
            for (const option of candidates.flat()) {
                if (this.expr.contains(option.id)) {
                    this.setState({ selection: option.id });
                    return;
                }
            }
            this.setState({ selection: this.expr.id }); // Last resort.
        }
    }

    constructor(props: EditorProps) {
        super(props);
        for (const shortcut of Object.keys(this.menuKeyEquivalents)) {
            assert(!(shortcut in this.editorShortcuts), "Shortcut conflict");
        }
        assert(
            !Object.prototype.hasOwnProperty.call(specialFunctions, props.topLevelName),
            "Cannot edit special functions",
        );
    }

    renderInlineEditor() {
        if (this.exprAreaMapRef.current == null || this.state.editing == null) return;
        return (
            <InlineEditor
                exprArea={this.exprAreaMapRef.current[this.state.editing.expr.id]}
                value={this.state.editing.value}
                disableSuggestions={!(this.state.editing.expr instanceof E.Call)}
                onChange={value => {
                    if (this.state.editing != null) {
                        this.update(this.state.editing.expr.id, x => x.withValue(value));
                        this.setState({ editing: { ...this.state.editing, value } });
                    }
                }}
                onDismiss={() => this.stopEditing(false)}
                onSubmit={value => {
                    this.update(this.state.editing?.expr?.id, x => x.withValue(value));
                    this.stopEditing(true);
                }}
            />
        );
    }

    render() {
        return (
            <div
                onKeyDown={this.keyDown}
                tabIndex={0}
                ref={this.containerRef}
                onBlur={this.focusChanged}
                onFocus={this.focusChanged}
                id="editor"
                // Needed for positioning the inline editor.
                style={{ position: "relative" }}
            >
                <ExprView
                    expr={this.expr}
                    selection={this.state.selection}
                    focused={this.state.focused}
                    foldComments={this.state.foldingComments}
                    theme={this.props.theme}
                    exprAreaMapRef={this.exprAreaMapRef}
                    // Callbacks.
                    contextMenuFor={this.contextMenuFor}
                    onClick={this.exprSelected}
                    onDoubleClick={this.startEditing}
                    onClickCreateCircle={this.createChildBlank}
                    onFocus={this.focus}
                />
                {this.renderInlineEditor()}
            </div>
        );
    }
}

export default function EditorWrapper(props: EditorWrapperProps) {
    return (
        <Editor
            {...props}
            workspace={assertSome(useContext(Workspace))}
            clipboard={assertSome(useContext(Clipboard))}
            theme={assertSome(useTheme())}
        />
    );
}
