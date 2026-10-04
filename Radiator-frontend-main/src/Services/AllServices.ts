import { useCallback } from 'react';
import { getData } from './ApiServices';
import axios from 'axios';

import { toast, toneFrom } from '../Components/ui/Toast';

// Hook: useAlertMsg — kept for its call sites; messages now render as toasts (spec §4.17).
// `alert` / `alertMessage` stay in the return value so existing destructuring keeps compiling.
export const useAlertMsg = () => {
    const callAlertMsg = useCallback((msg: string | null, category: string) => {
        if (!msg) return;
        toast.show(toneFrom(category), msg);
    }, []);
    return { alert: '', alertMessage: null as string | null, callAlertMsg };
};

// Utility: downloadFile
export const downloadFile = (
    object: BlobPart[],
    fileType: string,
    fileName: string
) => {
    const blob = new Blob(object, { type: fileType });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
};

// Utility: handleNumberChange (hook-compatible function)
export const handleNumberChange = (field: { onChange: (value: number | '') => void }) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value);
        field.onChange(isNaN(value) ? '' : value);
    };

// Utility: DateValidation
export const DateValidation = (value: string): true | string => {
    const date = new Date(value);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    const dayIsValid = /^[0-2][0-9]|3[0-1]$/.test(day);
    const monthIsValid = /^0[1-9]|1[0-2]$/.test(month);
    const yearIsValid = /^\d{4}$/.test(year.toString());

    if (!dayIsValid || !monthIsValid || !yearIsValid) {
        return "Date must be in the format DD-MM-YYYY";
    }

    return true;
};

// Utility: uploadS3

export const uploadS3 = async (file: File, importType: string) => {
    try {
        const url = "s3/upload/url";
        const query = { fileName: file.name, type: importType };
        const options = {
            headers: {
                'Content-Type': file.type,
                'Authorization': null as string | null
            }
        };

        const response = await getData(url, { params: query });
        await axios.put(response.signedUrl, file, options);

        return Promise.resolve(response);
    } catch (error) {
        throw error;
    }
};

// Utility: rejectedFileSize
export const rejectedFileSize = (rejectedSizeInBytes: string, small: boolean): string => {
    let rejectedFile = rejectedSizeInBytes.match(/\d/g);
    if (!rejectedFile) return '';
    const size = (parseInt(rejectedFile.join("")) / (1024 * 1024)).toFixed(0);
    return small
        ? `File is smaller than ${size} MB.`
        : `File is larger than ${size} MB.`;
};

// Utility: isSynced
export const isSynced = async () => {
    try {
        const url = "branding/is/synced";
        const response = await getData(url);
        return Promise.resolve(response);
    } catch (error) {
        throw error;
    }
};

// Utility: access
export const access = async () => {
    try {
        const url = "department/members/view/level";
        const response = await getData(url);
        return Promise.resolve(response);
    } catch (error) {
        throw error;
    }
};
