import { motion } from "framer-motion";
import React, { Fragment, ReactNode, useCallback } from "react";
import styled, { useTheme } from "styled-components";

import { Box } from "components";
import Expr from "expr";
import ExprView from "expr_view";

import { ContextMenuItem } from "components/context_menu";
import Shortcut from "components/shortcut";

const ExprList = styled.div`
    display: grid;
    grid-template-columns:
        [shortcut] auto
        [expr] min-content;
    /* We use margin-right in the shortcut to handle horizontal gap, this way the column collapses
    no nothing if there are no shortcuts present */
    gap: 10px 0;
    grid-auto-rows: min-content;
    align-items: start;
`;

const ExprListItem = styled(motion.div)`
    justify-self: left;
    border: 1px solid ${(p) => p.theme.colour.subtleClickable};
    border-radius: ${(p) => p.theme.exprList.borderRadius}px;
    display: flex;
    padding: ${(p) => p.theme.exprList.padding.css};
    width: min-content;
`;

const ExprListShortcut = styled.div`
    grid-column: shortcut;
    justify-self: right;
    margin-top: ${(p) => p.theme.exprView.padding.top / 2}px;
    margin-right: 10px;
`;

const DropMarker = styled.div`
    grid-column: 1 / -1;
    background: ${(p) => p.theme.colour.clickable};
    height: 1px;
    box-shadow: 0 0 ${(p) => p.theme.droppable.radius}px ${(p) => p.theme.droppable.colour};
`;

const Extras = styled.div`
    margin: ${(p) => p.theme.exprView.frozenPadding.css} !important;
`;

export interface ShortcutExpr {
    expr: Expr;
    shortcut?: string;
}

interface ExprViewListItemProps<E> {
    /** What width should this list take. */
    width?: number;
    /** Scale used for the interior ExprViews. */
    scale?: number;
    onDraggedOut?(item: E): void;
    //TODO: Draw our own menu with a large hitbox.
    onContextMenu?(item: E): ContextMenuItem[];
}

interface ExprViewListProps<E> extends ExprViewListItemProps<E> {
    animate?: boolean;
    items: readonly E[];
    fallback?: ReactNode;
    showDropMarker?: boolean;
    /** Should equal the anticipated extras width. */
    extrasFudge?: number; //TODO: I don't like this.
    onGetExtras?(item: E): ReactNode;
}

// This is needed to help with ExprView momoization.
function ExprViewListItem<E extends ShortcutExpr>({
    item,
    width,
    scale,
    onDraggedOut,
    onContextMenu,
}: ExprViewListItemProps<E> & { item: E }) {
    const draggedOut = useCallback(() => onDraggedOut?.(item), [onDraggedOut, item]);
    const contextMenu = useCallback(() => onContextMenu?.(item) ?? [], [onContextMenu, item]);
    return (
        <Box alignSelf="center">
            <ExprView
                frozen
                expr={item.expr}
                width={width}
                scale={scale}
                onDraggedOut={draggedOut}
                onContextMenu={contextMenu}
            />
        </Box>
    );
}

export default function ExprViewList<E extends ShortcutExpr>({
    items,
    animate,
    fallback,
    showDropMarker,
    extrasFudge,
    onGetExtras,
    width,
    ...itemProps
}: ExprViewListProps<E>) {
    const theme = useTheme();
    // Width with padding and the 1px border accounted for.
    const widthWithPadding =
        width === undefined
            ? undefined
            : (width ?? 0) +
              theme.exprList.padding.left +
              theme.exprList.padding.right +
              2 +
              (extrasFudge ?? 0);

    const renderItem = (item: E) => (
        // This has to be a fragment. Otherwise the items won't layout in a grid.
        <Fragment key={item.expr.id}>
            {item.shortcut && theme.feature.exprListShortcuts && (
                <ExprListShortcut>
                    <Shortcut keys={item.shortcut} />
                </ExprListShortcut>
            )}
            <div style={{ width: widthWithPadding, gridColumn: "expr" }}>
                <ExprListItem
                    initial={animate && { opacity: 0.8, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.1, ease: "easeIn" }}
                >
                    <ExprViewListItem width={width} item={item} {...itemProps} />
                    {onGetExtras && <Extras>{onGetExtras(item)}</Extras>}
                </ExprListItem>
            </div>
        </Fragment>
    );
    return (
        <ExprList>
            {showDropMarker && <DropMarker />}
            {items.length === 0 && fallback}
            {items.map(renderItem)}
        </ExprList>
    );
}
