import { useState, useMemo } from "react";
import Fuse from "fuse.js";

import { MenuItem } from "components/menu";
import { Optional, mod } from "utils";
import { specialFunctions } from "vm/interpreter";
import { useSelector } from "state/root";

// Using MenuItem is just convenient.
interface Suggestion extends MenuItem {
    name: string;
    original: boolean;
    special: boolean;
}

interface SuggestionsHook {
    suggestions: Suggestion[];
    selection: Optional<number>;
    setSelection(selection: Optional<number>): void;
    moveSelection(delta: 1 | -1): void;
}

export default function useSuggestions(
    value: string,
    { showValue = false, showSpecials = false, disable = false } = {},
): SuggestionsHook {
    const functionList = useSelector((x) => x.workspace.functions);
    const [selection, setSelection] = useState<Optional<number>>(0);

    // We use functionList, which is specially updated to make this memo infrequent.
    const fuse = useMemo(() => {
        if (disable) return null;
        console.info("Indexing functions...");
        const functions = functionList.map((name) => ({
            name,
            id: name,
            original: false,
            special: false,
            enabled: true,
        }));
        const special = Array.from(showSpecials ? specialFunctions.values() : [], (name) => ({
            name,
            id: name,
            original: false,
            special: true,
            enabled: true,
        }));
        return new Fuse([...functions, ...special], { keys: ["name"], findAllMatches: true });
    }, [disable, functionList, showSpecials]);

    const suggestions = useMemo(() => {
        const results = fuse?.search(value)?.slice(0, 5);
        if (
            value !== "" &&
            results != null &&
            results[0]?.name !== value &&
            showValue &&
            !specialFunctions.has(value)
        ) {
            results.push({
                name: value,
                id: value,
                original: true,
                special: false,
                enabled: true,
            });
        }
        if (!results?.length) {
            setSelection(null);
        }
        return results ?? [];
    }, [value, showValue, fuse]);

    return {
        selection,
        setSelection,
        suggestions,
        moveSelection(delta) {
            setSelection((x) =>
                mod(x == null ? (delta === 1 ? 0 : -1) : x + delta, suggestions.length),
            );
        },
    };
}
