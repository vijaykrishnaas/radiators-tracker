import React from 'react';
import LoaderSvg from '../Assets/images/rings.svg';

interface LoaderProps {
    loading: boolean;
}

function Loader({ loading }: LoaderProps) {
    return (
        <>
            {loading &&
                <div className="loader-container">
                    <div className="loader">
                        <img src={LoaderSvg} width="60px" />
                    </div>
                </div>
            }
        </>
    )
}

export default Loader;