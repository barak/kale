import { AiOutlineCloseCircle, AiOutlinePlayCircle, AiOutlineUndo } from "react-icons/ai";
import { motion, AnimatePresence } from "framer-motion";
import React from "react";
import styled from "styled-components";

import { Box, Stack, NonIdealText, IconButton, PaneHeading } from "components";
import { OpenedEditor, EditorKey } from "hooks/editor_stack";
import { useContextChecked } from "hooks";
import Builtins from "vm/builtins";
import EditorWrapper from "editor";
import Minimap, { MinimapProps } from "components/minimap";

import Debugger from "contexts/debugger";
import Workspace from "contexts/workspace";

const EditorHeading = styled(PaneHeading)`
    margin-left: ${(p) => p.theme.exprView.padding.left}px;
`;

const EditorHeader = styled(Stack).attrs({ gap: 5 })`
    position: sticky;
    top: 0;
    background: ${(p) => p.theme.colour.background};
    padding-bottom: 5px;
    border-bottom: 1px solid ${(p) => p.theme.colour.grey};
    align-items: center;
    z-index: 50;
`;

const RightGroup = styled.div`
    margin-left: auto;
`;

interface EditorListProps extends MinimapProps {
    editors: readonly OpenedEditor[];
    editorRefs: ReadonlyMap<EditorKey, React.MutableRefObject<HTMLDivElement>>;
}

export default function EditorStack({
    focused,
    editors,
    editorRefs,
    editorStackDispatch,
}: EditorListProps) {
    const dbg = useContextChecked(Debugger);
    const { workspace, dispatch } = useContextChecked(Workspace);

    function renderSection(editor: OpenedEditor) {
        const canUndo = (workspace.history.get(editor.name)?.length ?? 0) > 0;
        return (
            <motion.div
                key={editor.key.toString()}
                initial={false}
                exit={{ opacity: 0, scale: 0 }}
                transition={{ duration: 0.1, ease: "easeIn" }}
                positionTransition={{ duration: 0.1, ease: "easeIn" }}
            >
                <EditorHeader>
                    <EditorHeading>{editor.name}</EditorHeading>
                    <IconButton
                        onClick={() =>
                            editorStackDispatch({ type: "closeEditor", key: editor.key })
                        }
                    >
                        <AiOutlineCloseCircle />
                    </IconButton>
                    <IconButton disabled={!canUndo}>
                        <AiOutlineUndo
                            onClick={() => dispatch({ type: "undo", name: editor.name })}
                        />
                    </IconButton>
                    <RightGroup>
                        {editor.type === "user" && (
                            <IconButton
                                onClick={() => dbg.evalFunction(editor.name)}
                                disabled={dbg.interpreter != null}
                            >
                                <AiOutlinePlayCircle />
                            </IconButton>
                        )}
                    </RightGroup>
                </EditorHeader>
                <Box marginTop={10} marginBottom={20} overflowX="auto">
                    {editor.type === "builtin" ? (
                        <p>
                            {editor.name} is a builtin function.
                            <br />
                            <b>{Builtins[editor.name].value.help}</b>
                        </p>
                    ) : (
                        <EditorWrapper
                            functionName={editor.name}
                            editorStackDispatch={editorStackDispatch}
                            focused={editor.key === focused}
                            ref={editorRefs.get(editor.key)}
                            // It's proably easiest to just create a new editor for each function.
                            key={editor.name}
                        />
                    )}
                </Box>
            </motion.div>
        );
    }

    return (
        <Stack
            gap={20}
            height="100%"
            justifyContent="space-between"
            overflowX="hidden"
            gridArea="editor"
        >
            <Stack vertical overflowX="hidden" flex="auto">
                {editors.length === 0 && <NonIdealText>No editors open</NonIdealText>}
                <AnimatePresence>{editors.map(renderSection)}</AnimatePresence>
            </Stack>
            <Box top={0} position="sticky" flex="none">
                <Minimap
                    editors={editors.filter((x) => x.type === "user")}
                    focused={focused}
                    editorStackDispatch={editorStackDispatch}
                />
            </Box>
        </Stack>
    );
}
