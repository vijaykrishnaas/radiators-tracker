import React from "react";
import TimePicker, { TimePickerProps } from 'react-time-picker';
import 'react-time-picker/dist/TimePicker.css';
import 'react-calendar/dist/Calendar.css';
import 'react-clock/dist/Clock.css';
import '../Assets/css/components/datePicker.css';

interface TimeCalendarProps {
    name?: string;
    value?: string; // TimePicker usually uses string like "10:30"
    onChange?: (value: string | null) => void;
    customClass?: string;
    returnValue?: TimePickerProps['returnValue'];
    startDate?: Date;
    disableCalendar?: boolean;
    disabled?: boolean;
    format?: string;
    id?: string;
    maxDate?: Date;
    minDate?: Date;
    clearIcon?: React.ReactNode;
    clockIcon?: React.ReactNode;
}
const TimeCalendar: React.FC<TimeCalendarProps> = (props) => {
    const timePickerClass = props.customClass || '';

    const safeTimeValue =
        props.value && /^\d{1,2}:\d{2}$/.test(props.value)
            ? props.value
            : null;

    return (
        <div className={timePickerClass}>
            <TimePicker
                name={props.name}
                onChange={props.onChange}
                className="form-control"
                returnValue={props.returnValue}
                startDate={props.startDate}
                disableCalendar={props.disableCalendar}
                disabled={props.disabled}
                format={props.format}
                id={props.id}
                maxDate={props.maxDate}
                minDate={props.minDate}
                value={safeTimeValue}
                clearIcon={props.clearIcon}
                clockIcon={props.clockIcon}
            />
        </div>
    );
};
export default TimeCalendar;
