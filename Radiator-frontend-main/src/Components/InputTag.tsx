import React from "react";
import { WithContext as ReactTags, Tag } from "react-tag-input"; // 👈 Import Tag type directly
import "../Assets/css/components/inputTags.css";

interface InputTagProps {
    tags: Tag[];
    suggestions?: Tag[];
    delimiters?: number[];
    classNames?: Record<string, string>;
    handleDelete: (i: number) => void;
    handleAddition: (tag: Tag) => void;
    handleDrag: (tag: Tag, currPos: number, newPos: number) => void;
    handleTagClick?: (i: number) => void;
    inputFieldPosition?: "inline" | "top" | "bottom";
    placeholder?: string;
    editable?: boolean;
    autofocus?: boolean;
    maxTags?: number;
    disabled?: boolean;
}

const InputTag: React.FC<InputTagProps> = (props) => {
    return (
        <ReactTags
            tags={props.tags}
            classNames={props.classNames}
            delimiters={props.delimiters}
            suggestions={props.suggestions}
            handleDelete={props.handleDelete}
            handleAddition={props.handleAddition}
            handleDrag={props.handleDrag}
            handleTagClick={props.handleTagClick}
            inputFieldPosition={props.inputFieldPosition}
            placeholder={props.placeholder ?? "Add New Tag"}
            editable={props.editable ?? true}
            autoFocus={props.autofocus ?? false}
            maxTags={props.maxTags}
            inputProps={{
                ...(props.disabled ? { disabled: "disabled" } : {}),
            }}
        />
    );
};

export default InputTag;
