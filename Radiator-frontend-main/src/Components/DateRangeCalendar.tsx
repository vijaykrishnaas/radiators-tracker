import React from "react";
import DateRangePicker from '@wojtekmaj/react-daterange-picker';
import '@wojtekmaj/react-daterange-picker/dist/DateRangePicker.css';
import 'react-calendar/dist/Calendar.css';
import 'react-clock/dist/Clock.css';
import '../Assets/css/components/datePicker.css';

const DateRangeCalendar = (props) => {
    const datePickerReadonly = props.readonly ? (e) => e.preventDefault() : '';

    return (
        <>
            <DateRangePicker
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
                value={props.value}
                onKeyDown={datePickerReadonly}
            />
        </>
    );
}

export default DateRangeCalendar;