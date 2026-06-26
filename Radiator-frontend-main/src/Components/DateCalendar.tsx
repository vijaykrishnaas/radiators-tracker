import React from 'react';
import DatePicker from 'react-date-picker';
// react-date-picker doesn't export its Value type from a stable path; mirror it locally.
type Value = Date | null | [Date | null, Date | null];
import 'react-date-picker/dist/DatePicker.css';
import 'react-calendar/dist/Calendar.css';
import 'react-clock/dist/Clock.css';
import '../Assets/css/components/datePicker.css';

interface DateCalendarProps {
    name?: string;
    onChange?: (date: Date | Date[] | null) => void;
    customClass?: string;
    returnValue?: 'start' | 'end' | 'range';
    startDate?: Date;
    disableCalendar?: boolean;
    disabled?: boolean;
    format?: string;
    id?: string;
    maxDate?: Date;
    minDate?: Date;
    value?: Date | null;
    readonly?: boolean;
}

const DateCalendar: React.FC<DateCalendarProps> = (props) => {
    const datePickerClass = props.customClass ?? '';
    const datePickerReadonly = props.readonly
        ? (e: React.KeyboardEvent<HTMLInputElement>) => e.preventDefault()
        : undefined;

    const handleChange = (value: Value) => {
        if (props.onChange) {
            if (Array.isArray(value)) {
                const dates = value.map(v => (v instanceof Date ? v : null));
                props.onChange(dates as Date[]);
            } else if (value instanceof Date) {
                props.onChange(value);
            } else {
                props.onChange(null);
            }
        }
    };

    return (
        <div className={datePickerClass}>
            <DatePicker
                name={props.name}
                onChange={handleChange}
                className="form-control"
                returnValue={props.returnValue}
                disableCalendar={props.disableCalendar}
                disabled={props.disabled}
                format={props.format}
                id={props.id}
                maxDate={props.maxDate}
                minDate={props.minDate}
                value={props.value}
                onKeyDown={datePickerReadonly}
            />
        </div>
    );
};

export default DateCalendar;
