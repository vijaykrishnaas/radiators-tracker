import { useRef, useState } from 'react';

import '../Assets/css/components/filters.css';
import CheckBox from './CheckBox';
import RadioButton from './RadioButton';
import Icons from './Icons';

const Filters = () => {

    const todoRef = useRef<HTMLDivElement | null>(null);
    const [isVisible, setIsVisible] = useState(false);

    const toggleFilter = () => {
        setIsVisible(!isVisible);
        const filter = todoRef.current;
        if (filter) {
            if (isVisible) {
                filter.style.display = "none";
            } else {
                filter.style.display = "block";
            }
        }
    };

    return (
        <>
            <div className="mx-2">
                <div className="dropdown filter-section">
                    <button className="btn btn-filter" type="button" onClick={toggleFilter}>
                        <Icons iconName="filter" className="icon-15" />
                    </button>
                    <div ref={todoRef} className="filter collapse">
                        <div>
                            <div className="headerRow d-flex justify-content-end">
                                <a href="# " className="mt-2">Clear All</a>
                            </div>
                            <div>
                                <div className="filter-accordion">
                                    <div className="accordion" id="accordionExample">
                                        <div className="accordion-item mt-3 border border-0">
                                            <div className="accordion-header">
                                                <button className="accordion-button pb-2 px-1" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne1" aria-expanded="true" aria-controls="collapseOne1">
                                                    <Icons iconName="category" className="me-1 icon-20" />Category
                                                </button>
                                            </div>
                                            <div id="collapseOne1" className="accordion-collapse collapse show" data-bs-parent="#accordionExample">
                                                <div className="accordion-body pb-0">
                                                    <div className='row'>
                                                        <div className='col-md-12 d-flex justify-content-between filter-radio'>
                                                            <div className='col-md-3'>
                                                                <input type="radio" className="btn-check" name="options" id="option1" autoComplete="off" checked></input>
                                                                <label htmlFor="option1">BE</label>
                                                            </div>
                                                            <div className='col-md-3'>
                                                                <input type="radio" className="btn-check" name="options" id="option2" autoComplete="off"></input>
                                                                <label htmlFor="option2">MBA</label>
                                                            </div>
                                                            <div className='col-md-3'>
                                                                <input type="radio" className="btn-check" name="options" id="option3" autoComplete="off" disabled></input>
                                                                <label htmlFor="option3">ME</label>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="accordion-item mt-2 border border-0">
                                            <div className="accordion-header">
                                                <button className="accordion-button pb-2 px-1 collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseTwo" aria-expanded="false" aria-controls="collapseTwo">
                                                    <Icons iconName="coursetype" className="me-1 icon-20 icon-filter" />Course
                                                </button>
                                            </div>
                                            <div id="collapseTwo" className="accordion-collapse collapse" data-bs-parent="#accordionExample">
                                                <div className="accordion-body filter-check pb-0">

                                                    <CheckBox
                                                        value="ComputerScience"
                                                        labelText="Computer Science and Engineering"
                                                        id="ComputerScience"
                                                        defaultChecked={true}
                                                    />

                                                    <CheckBox
                                                        value="Mechanical"
                                                        labelText="Mechanical Engineering"
                                                        id="Mechanical"
                                                    />

                                                    <CheckBox
                                                        value="Electrical"
                                                        labelText="Electrical and Computer Engineering"
                                                        id="Electrical"
                                                    />

                                                    <CheckBox
                                                        value="Chemical"
                                                        labelText="Chemical Engineering"
                                                        id="Chemical"
                                                    />

                                                    <CheckBox
                                                        value="Aerospace"
                                                        labelText="Aerospace Engineering"
                                                        id="Aerospace"
                                                    />

                                                </div>
                                            </div>
                                        </div>
                                        <div className="accordion-item mt-2 border border-0">
                                            <div className="accordion-header">
                                                <button className="accordion-button pb-2 px-1 collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseThree" aria-expanded="false" aria-controls="collapseThree">
                                                    <Icons iconName="info_mail" className="me-1 icon-20 icon-filter" />Mail
                                                </button>
                                            </div>
                                            <div id="collapseThree" className="accordion-collapse collapse" data-bs-parent="#accordionExample">
                                                <div className="accordion-body filter-check pb-0">
                                                    <CheckBox
                                                        value="Verified"
                                                        labelText="Verified Emails"
                                                        id="Verified"
                                                        defaultChecked={true}
                                                    />

                                                    <CheckBox
                                                        value="NotVerified"
                                                        labelText="Not Verified Emails"
                                                        id="NotVerified"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="accordion-item mt-2 border border-0">
                                            <div className="accordion-header">
                                                <button className="accordion-button pb-2 px-1 collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseFour" aria-expanded="false" aria-controls="collapseFour">
                                                    <Icons iconName="currencyrupee" className="me-1 icon-20 icon-filter" />Fees
                                                </button>
                                            </div>
                                            <div id="collapseFour" className="accordion-collapse collapse" data-bs-parent="#accordionExample">
                                                <div className="accordion-body pb-0">
                                                    <RadioButton
                                                        value=""
                                                        name="group"
                                                        labelText="Application"
                                                        id="application"
                                                        defaultChecked={true}
                                                    />

                                                    <RadioButton
                                                        value=""
                                                        name="group"
                                                        labelText="Exam"
                                                        id="exam"
                                                        defaultChecked={true}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="accordion-item mt-2 border border-0">
                                            <div className="accordion-header">
                                                <button className="accordion-button pb-2 px-1 collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseFive" aria-expanded="false" aria-controls="collapseFive">
                                                    <Icons iconName="semester" className="me-1 icon-20 icon-filter" />Semester
                                                </button>
                                            </div>
                                            <div id="collapseFive" className="accordion-collapse collapse" data-bs-parent="#accordionExample">
                                                <div className="accordion-body pb-0">

                                                    <RadioButton
                                                        value=""
                                                        name="group"
                                                        labelText="Semester 1"
                                                        id="sem1"
                                                        defaultChecked={true}
                                                    />

                                                    <RadioButton
                                                        value=""
                                                        name="group"
                                                        labelText="Semester 2"
                                                        id="sem2"
                                                        defaultChecked={true}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="row mt-5">
                                    <div className="col-md-12 result-Btn d-flex justify-content-center">
                                        <button className="btn btn-sm btn-primary py-2 px-4" onClick={toggleFilter}>Show Result</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className='filter-background' onClick={toggleFilter}>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default Filters