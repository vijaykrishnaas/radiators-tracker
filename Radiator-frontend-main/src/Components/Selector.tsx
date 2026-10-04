import React from "react";
import Select, { GroupBase, MultiValue, OptionsOrGroups, SingleValue, StylesConfig } from "react-select";
import type { ActionMeta } from "react-select";
import { selectStyles } from "../theme/reactSelectTheme";

interface SelectorProps<SelectOption, IsMulti extends boolean = false> {
  isMulti?: IsMulti;
  placeholder?: React.ReactNode;
  disabled?: boolean;
  isDisabled?: boolean;
  isLoading?: boolean;
  isClearable?: boolean;
  isSearchable?: boolean;
  value?: IsMulti extends true ? MultiValue<SelectOption> : SingleValue<SelectOption>;
  name?: string;
  options?: OptionsOrGroups<SelectOption, GroupBase<SelectOption>>;
  className?: string;
  prefixClassName?: string;
  id?: string;
  /** id of the inner <input>, so a <label htmlFor> points at it. */
  inputId?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  onBlur?: () => void;
  onChange?: (
    newValue: IsMulti extends true ? MultiValue<SelectOption> : SingleValue<SelectOption>,
    actionMeta: ActionMeta<SelectOption>
  ) => void;
}

/** react-select themed to the form controls (spec §4.5). The menu portals to <body> above modals. */
const Selector = <SelectOption, IsMulti extends boolean = false>(
  props: SelectorProps<SelectOption, IsMulti>
) => {
  return (
    <Select<SelectOption, IsMulti>
      isMulti={props.isMulti}
      placeholder={props.placeholder}
      isDisabled={props.disabled || props.isDisabled}
      isLoading={props.isLoading}
      isClearable={props.isClearable}
      isSearchable={props.isSearchable}
      value={props.value}
      name={props.name}
      options={props.options}
      className={props.className}
      classNamePrefix={props.prefixClassName}
      styles={selectStyles as unknown as StylesConfig<SelectOption, IsMulti>}
      id={props.id}
      inputId={props.inputId}
      aria-label={props["aria-label"]}
      aria-invalid={props["aria-invalid"]}
      onBlur={props.onBlur}
      onChange={props.onChange}
      menuPortalTarget={document.body}
      menuPosition="fixed"
      menuShouldBlockScroll={false}
    />
  );
};

export default Selector;
