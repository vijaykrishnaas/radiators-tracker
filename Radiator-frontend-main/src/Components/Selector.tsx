import React, { useRef, useState } from "react";
import Select, { GroupBase, MultiValue, OptionsOrGroups, SingleValue, StylesConfig } from "react-select";
import type { ActionMeta, SelectInstance } from "react-select";
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
  noOptionsMessage?: () => React.ReactNode;
  onChange?: (
    newValue: IsMulti extends true ? MultiValue<SelectOption> : SingleValue<SelectOption>,
    actionMeta: ActionMeta<SelectOption>
  ) => void;
}

// Menu list height cap (matches menuList maxHeight in the theme), the space kept from the viewport edge, and a floor.
const MENU_MAX = 260;
const MENU_GAP = 16;
const MENU_MIN = 120;

/** react-select themed to the form controls (spec §4.5). The menu portals to <body> above modals. */
const Selector = <SelectOption, IsMulti extends boolean = false>(
  props: SelectorProps<SelectOption, IsMulti>
) => {
  // The menu is position:fixed (portal), where react-select neither flips nor caps its height, so a control near
  // the bottom of the viewport opened a menu whose last options were off-screen. Measure on open and fit it.
  const ref = useRef<SelectInstance<SelectOption, IsMulti>>(null);
  const [fit, setFit] = useState<{ placement: "bottom" | "top"; max: number }>({ placement: "bottom", max: MENU_MAX });
  const onMenuOpen = () => {
    const r = ref.current?.controlRef?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - MENU_GAP;
    const above = r.top - MENU_GAP;
    if (below >= MENU_MAX || below >= above) setFit({ placement: "bottom", max: Math.max(MENU_MIN, Math.min(MENU_MAX, below)) });
    else setFit({ placement: "top", max: Math.max(MENU_MIN, Math.min(MENU_MAX, above)) });
  };
  return (
    <Select<SelectOption, IsMulti>
      ref={ref}
      onMenuOpen={onMenuOpen}
      menuPlacement={fit.placement}
      maxMenuHeight={fit.max}
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
      classNamePrefix={props.prefixClassName || "rs"}
      styles={selectStyles as unknown as StylesConfig<SelectOption, IsMulti>}
      id={props.id}
      inputId={props.inputId}
      aria-label={props["aria-label"]}
      aria-invalid={props["aria-invalid"]}
      onBlur={props.onBlur}
      noOptionsMessage={props.noOptionsMessage}
      onChange={props.onChange}
      menuPortalTarget={document.body}
      menuPosition="fixed"
      menuShouldBlockScroll={false}
    />
  );
};

export default Selector;
