import React from "react";
import Select, { GroupBase, MultiValue, OptionsOrGroups, SingleValue, StylesConfig } from "react-select";
import type { ActionMeta } from "react-select";
import { SelectOption } from "../Types/common";

const selectStyles: StylesConfig<SelectOption, boolean> = {
  valueContainer: (base) => ({
    ...base,
    padding: '1px 6px 3px',
  }),
  control: (base, state) => ({
    ...base,
    fontSize: '14px',
    padding: '0px 5px',
    minHeight: '38px',
    borderRadius: 'var(--r-sm)',
    border: state.isFocused ? '1px solid var(--primary) !important' : '1px solid var(--line-strong) !important',
    boxShadow: state.isFocused ? 'var(--focus-ring)' : 'none',
    ':hover': {
      border: '1px solid var(--primary) !important',
    },
  }),
  option: (base, state) => ({
    ...base,
    zIndex: 99999,
    backgroundColor: state.isSelected ? 'var(--navMenuActiveColor)' : '#FFFFFF',
    color: 'var(--ink-700)',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: 'var(--canvas)',
    },
  }),
  multiValue: (base) => ({
    ...base,
    backgroundColor: 'var(--canvas)',
    padding: '0.2rem 0.3rem',
    border: '1px solid var(--primary) !important',
    marginRight: '5px',
    borderRadius: 'var(--r-sm)',
    color: 'var(--primary) !important',
  }),
  multiValueLabel: (base) => ({
    ...base,
    padding: '0px 3px',
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: "#D0D5DD",
    marginLeft: '5px',
    padding: '0 2px',
    marginRight: '-4px',
    opacity: '0.75',
    borderLeft: '1px solid #D0D5DD !important',
    svg: {
      fill: "#B0B4B9",
    },
    ':hover': {
      backgroundColor: '#e4e4e4',
      opacity: '1',
      borderRadius: '3px',
    },
  }),
  menuList: (base) => ({
    ...base,
    maxHeight: 200,
    overflowY: 'auto'
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 999999,
  }),
  menu: (base) => ({
    ...base,
    zIndex: 999999,
  })
};

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
  onChange?: (
    newValue: IsMulti extends true ? MultiValue<SelectOption> : SingleValue<SelectOption>,
    actionMeta: ActionMeta<SelectOption>
  ) => void;
}

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
      styles={selectStyles}
      id={props.id}
      onChange={props.onChange}
      menuPortalTarget={document.body}
      menuPosition="fixed"
    />
  );
};

export default Selector;