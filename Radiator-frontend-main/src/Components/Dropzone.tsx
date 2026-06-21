import React from 'react';
import { useDropzone } from 'react-dropzone';
import type { DropEvent } from 'react-dropzone';
import type { FileRejection } from 'react-dropzone';
import Icons from './Icons';
import '../Assets/css/components/dropzone.css';

interface DropzoneProps {
    accept: { [key: string]: string[] };
    onDrop: (acceptedFiles: File[], fileRejections: FileRejection[]) => void;
    onFileRemove?: (fileName: string) => void;
    acceptedFiles: File[];
    fileRejections: FileRejection[];
    maxFiles?: number;
    maxSize: number; // in MB
    multiple?: boolean;
    dropzoneContent?: string;
    acceptedFileClassName?: string;
    rejectedFileClassName?: string;
}

const Dropzone: React.FC<DropzoneProps> = (props) => {
    const {
        getRootProps,
        getInputProps,
    } = useDropzone({
        accept: props.accept,
        onDrop: (acceptedFiles: File[], fileRejections: FileRejection[], _event: DropEvent) => {
            if (props.maxFiles) {
                const currentTotal = acceptedFiles.length + props.acceptedFiles.length;
                if (currentTotal <= props.maxFiles) {
                    props.onDrop(acceptedFiles, fileRejections);
                } else {
                    const newFileRejections: FileRejection[] = acceptedFiles.map((file) => ({
                        file,
                        errors: [{
                            code: 'too-many-files',
                            message: `Maximum of ${props.maxFiles} files allowed`,
                        }],
                    }));
                    props.onDrop([], [...fileRejections, ...newFileRejections]);
                }
            } else {
                props.onDrop(acceptedFiles, fileRejections);
            }
        },
        multiple: props.multiple,
        maxFiles: props.maxFiles,
        maxSize: props.maxSize * 1024 * 1024,
    });

    const rejectedFileSize = (fileSizeInBytes: number): string => {
        return (fileSizeInBytes / (1024 * 1024)).toFixed(2);
    };

    const handleRemoveFile = (fileName: string) => {
        if (typeof props.onFileRemove === 'function') {
            props.onFileRemove(fileName);
        }
    };

    const uniqueAcceptedFiles = Array.from(
        new Map(props.acceptedFiles.map((file) => [file.name, file])).values()
    );

    const acceptedFileItems = uniqueAcceptedFiles.map((file) => (
        <div className="success-container" key={file.name}>
            <p className="mb-0">
                {file.name}
                <button
                    className="remove-btn"
                    type="button"
                    onClick={() => handleRemoveFile(file.name)}
                >
                    <Icons iconName="delete" className="icon-20 remove-icon me-1" />
                </button>
            </p>
        </div>
    ));

    const acceptedFileFormats = Object.values(props.accept).flat();

    const fileRejectionItems = props.fileRejections.map(({ file, errors }) => (
        <div className="failure-container" key={`${file.name}-${file.lastModified}`}>
            <p>{file.name}</p>
            {errors.map((error, index) => (
                <span key={index}>
                    <p className="mb-0">
                        {error.code === 'file-too-large' &&
                            `File "${file.name}" is larger than ${props.maxSize} MB. Actual size: ${rejectedFileSize(file.size)} MB`}
                    </p>
                    <p className="mb-0">
                        {error.code === 'file-invalid-type' &&
                            `File type must be one of ${acceptedFileFormats.join(', ')}`}
                    </p>
                    <p className="mb-0">
                        {error.code === 'too-many-files' &&
                            `Maximum of ${props.maxFiles} files allowed`}
                    </p>
                </span>
            ))}
        </div>
    ));

    return (
        <section className="container-dropzone">
            <div
                {...getRootProps({
                    className: `dropzone form-control ${props.dropzoneContent || ''}`,
                })}
            >
                <div className="dropdown-btn d-flex justify-content-center align-items-center">
                    <div className="d-flex align-items-center">
                        <span className="select-color me-1">Select a file</span>
                        <span className="drag-text-color">or drag it here</span>
                    </div>
                </div>
                <input {...getInputProps()} />
            </div>

            <aside>
                <ul className="list-group-item">
                    {props.acceptedFiles.length > 0 && (
                        <li className={props.acceptedFileClassName}>
                            {acceptedFileItems}
                        </li>
                    )}
                </ul>
                <ul className="list-group-item">
                    {props.fileRejections.length > 0 && (
                        <li className={props.rejectedFileClassName}>
                            {fileRejectionItems}
                        </li>
                    )}
                </ul>
            </aside>
        </section>
    );
};

export default Dropzone;
