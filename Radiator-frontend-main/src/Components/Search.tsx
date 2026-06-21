import React, { useMemo } from "react";
import debounce from "lodash.debounce";

interface SearchProps {
    getData: () => void;
    disabled?: boolean;
    placeholder?: string;
    storageKey?: string;
}

const Search: React.FC<SearchProps> = ({ getData, disabled, placeholder, storageKey = "search" }) => {

    const searchFieldForm = (value: string) => {
        if (value.length > 2) {
            sessionStorage.setItem(storageKey, value);
            getData();
        } else if (value.length === 0) {
            sessionStorage.removeItem(storageKey);
            getData();
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        searchFieldForm(e.target.value);
    };

    const debouncedResults = useMemo(() => {
        return debounce(handleChange, 200);
    }, []);

    return (
        <input
            type="text"
            className="form-control search-input"
            disabled={disabled}
            onChange={debouncedResults}
            id="mySearchBoxone"
            placeholder={placeholder || "Search here..."}
        />
    );
};

export default Search;
