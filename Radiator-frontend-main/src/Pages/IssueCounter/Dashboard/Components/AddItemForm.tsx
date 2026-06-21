import { Controller } from "react-hook-form";
import { useDropzone, type FileRejection } from 'react-dropzone';
import { useState, useEffect } from "react";

import RadioButton from "../../../../Components/RadioButton";
import InputText from "../../../../Components/InputText";
import Selector from "../../../../Components/Selector";
import Icons from "../../../../Components/Icons";
import Dropzone from "../../../../Components/Dropzone";
import { SelectOption } from "../../../../Types/common";
import { FoodType, ServingType } from "../../../../Enums/Enum";

const AddItemForm = ({
    control,
    errors,
    setValue,
    getValues,
    category,
    canteens,
    menuTagGroups,
    tokenGroups,
    setTokenGroups,
    itemTypeOptions,
    getTokenListData,
    fields,
    append,
    remove,
    type,
    id
}: AddItemFormProps) => {

    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [fileRejection, setFileRejections] = useState<FileRejection[]>([]);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const { fileRejections, getRootProps, getInputProps } = useDropzone({
        accept: {
            "image/*": [".jpg", ".jpeg", ".png"],
        },
        minSize: 1,
    });

    useEffect(() => {
        setValue(`foodListManagement.img`, uploadedFiles);
    }, [uploadedFiles]);

    return (
        <>
            <div className='row form-group'>
                <div className='col-12 col-xl-5'>
                    <label className="form-label label-required mb-2 font-w500">Counter Type</label>
                    <Controller
                        name="foodListManagement.servingType"
                        control={control}
                        rules={{ required: 'Counter Type is required' }}
                        render={({ field }) => (
                            <div className="d-flex gap-3">
                                <RadioButton
                                    {...field}
                                    labelText="Live Counter"
                                    id="liveCounter"
                                    value={ServingType.live}
                                    onChange={() => field.onChange(ServingType.live)}
                                    checked={field.value === ServingType.live}
                                    disabled={type === "edit" ? true : false}
                                />
                                <RadioButton
                                    {...field}
                                    labelText="Packaged items"
                                    id="packed"
                                    value={ServingType.packed}
                                    onChange={() => field.onChange(ServingType.packed)}
                                    checked={field.value === ServingType.packed}
                                    disabled={type === "edit" ? true : false}
                                />
                            </div>
                        )}
                    />
                    {errors.foodListManagement?.servingType && (
                        <span className="text-danger">{errors.foodListManagement.servingType.message}</span>
                    )}
                </div>
                <div className="col-12 col-xl-5">
                    <label className="form-label label-required mb-2 font-w500">Food Code</label>
                    <Controller
                        name="foodListManagement.foodCode"
                        control={control}
                        rules={{ required: 'Food Code is required' }}
                        render={({ field }) => (
                            <InputText
                                className="form-control"
                                {...field}
                                value={field.value ?? ""}
                            />)}
                    />
                    {errors.foodListManagement?.foodCode && (
                        <span className="text-danger">{errors.foodListManagement.foodCode.message}</span>
                    )}
                </div>
            </div>
            {
                getValues(`foodListManagement.servingType`) == ServingType.packed && (
                    <div className='col-md-12 d-flex align-items-center mt-4 gap-3'>
                        <label className="font-s16 mb-1 font-w500">Basic Information</label>
                        <div className="session-custom-border flex-grow-1"></div>
                    </div>)
            }

            <div className="row form-group g-3">
                <div className="col-12 col-xl-5">
                    <label className="form-label label-required mb-2 font-w500"> Item Name (English)</label>
                    <Controller
                        name="foodListManagement.name.english"
                        control={control}
                        rules={{ required: 'Item Name (English) is required' }}
                        render={({ field }) => (
                            <InputText className="form-control" {...field} placeholder="Enter Item Name in English" />
                        )}
                    />
                    {errors.foodListManagement?.name?.english && (
                        <span className="text-danger">{errors.foodListManagement.name.english.message}</span>
                    )}
                </div>

                <div className="col-12 col-xl-5">
                    <label className="form-label label-required mb-2 font-w500">Item Name (Tamil)</label>
                    <Controller
                        name="foodListManagement.name.tamil"
                        control={control}
                        rules={{ required: 'Item Name (Tamil) is required' }}
                        render={({ field }) => (
                            <InputText className="form-control" {...field} placeholder="Enter Item Name in Tamil" />
                        )}
                    />
                    {errors.foodListManagement?.name?.tamil && (
                        <div className="text-danger">{errors.foodListManagement.name.tamil.message}</div>
                    )}
                </div>
                {getValues(`foodListManagement.servingType`) === ServingType.packed && (
                    <div className="col-12 col-xl-5">
                        <label className="form-label label-required mb-2 font-w500">Food Type</label>
                        <Controller
                            name="foodListManagement.foodType"
                            control={control}
                            rules={{ required: 'Food Type is required' }}
                            render={({ field }) => (
                                <div className="d-flex gap-3">
                                    <RadioButton
                                        {...field}
                                        labelText="Veg"
                                        value={FoodType.VEG}
                                        id="v"
                                        onChange={() => field.onChange(FoodType.VEG)}
                                        checked={field.value === FoodType.VEG}
                                    />

                                    <RadioButton
                                        {...field}
                                        labelText="Non-Veg"
                                        id="nv"
                                        value={FoodType.NON_VEG}
                                        onChange={() => field.onChange(FoodType.NON_VEG)}
                                        checked={field.value === FoodType.NON_VEG}
                                    />

                                    <RadioButton
                                        {...field}
                                        labelText="Egg"
                                        id="e"
                                        value={FoodType.EGGITARIAN}
                                        onChange={() => field.onChange(FoodType.EGGITARIAN)}
                                        checked={field.value === FoodType.EGGITARIAN}
                                    />

                                </div>
                            )}
                        />
                        {errors.foodListManagement?.foodType && (
                            <span className="text-danger">{errors.foodListManagement.foodType.message}</span>
                        )}
                    </div>)}
            </div>

            <div className="row form-group g-3">
                {
                    getValues(`foodListManagement.servingType`) !== ServingType.packed ? (
                        <div className="col-12 col-xl-5">
                            <label className="form-label label-required mb-2 font-w500">Food Type</label>
                            <Controller
                                name="foodListManagement.foodType"
                                control={control}
                                rules={{ required: 'Food Type is required' }}
                                render={({ field }) => (
                                    <div className="d-flex gap-3">
                                        <RadioButton {...field} labelText="Veg" value={FoodType.VEG} onChange={() => field.onChange(FoodType.VEG)} checked={field.value === FoodType.VEG} />
                                        <RadioButton {...field} labelText="Non-Veg" value={FoodType.NON_VEG} onChange={() => field.onChange(FoodType.NON_VEG)} checked={field.value === FoodType.NON_VEG} />
                                        <RadioButton {...field} labelText="Egg" value={FoodType.EGGITARIAN} onChange={() => field.onChange(FoodType.EGGITARIAN)} checked={field.value === FoodType.EGGITARIAN} />
                                    </div>
                                )}
                            />
                            {errors.foodListManagement?.foodType && (
                                <span className="text-danger">{errors.foodListManagement.foodType.message}</span>
                            )}
                        </div>) : (
                        <div className="col-12 col-xl-5">
                            <label className="form-label label-required mb-2 font-w500">Item type</label>
                            <Controller
                                name="foodListManagement.storageType"
                                control={control}
                                rules={{ required: 'Item type is required' }}
                                render={({ field }) => (
                                    <Selector
                                        {...field}
                                        options={itemTypeOptions}
                                        isMulti={false}
                                        isClearable={false}
                                    />
                                )}
                            />
                            {errors.foodListManagement?.storageType && (
                                <span className="text-danger">{errors.foodListManagement.storageType.message}</span>
                            )}
                        </div>
                    )}

                <div className="col-12 col-xl-5">
                    <label className="form-label label-required mb-2 font-w500">Food Category</label>
                    <Controller
                        name="foodListManagement.category"
                        control={control}
                        rules={{ required: "Food Category is required" }}
                        render={({ field }) => (
                            <Selector
                                {...field}
                                value={field.value}
                                onChange={(val) => field.onChange(val)}
                                options={category}
                                isMulti={false}
                                isClearable={false}
                            />
                        )}
                    />
                    {errors.foodListManagement?.category && (
                        <span className="text-danger">{errors.foodListManagement.category.message}</span>
                    )}
                </div>
            </div>

            {
                getValues(`foodListManagement.servingType`) !== ServingType.packed && (
                    <div className="row form-group">
                        <div className="col-12 col-xl-5">
                            <label className="form-label label-required mb-2 font-w500">Food Menu</label>
                            <Controller
                                name="foodListManagement.tags"
                                control={control}
                                render={({ field }) => (
                                    <Selector
                                        {...field}
                                        id="tags"
                                        placeholder="Select Food Menu"
                                        options={menuTagGroups}
                                        isMulti={true}
                                        isClearable={false}
                                        value={field.value || []}
                                        onChange={(selected) => field.onChange(selected)}
                                    />
                                )}
                            />

                        </div>
                    </div>
                )}

            <div className='col-md-12 d-flex align-items-center mt-5 gap-3'>
                <label className="font-s16 mb-1 font-w500">Canteen Tagging</label>
                <div className="session-custom-border flex-grow-1"></div>
            </div>

            {fields.map((fieldItem, index) => (
                <div className="row form-group g-3" key={fieldItem.id}>
                    <div className='col-md-12 d-flex justify-content-end'>
                        {index === 0 && (
                            <button type="button" className='btn btn-sm btn-gradient' onClick={() => append({
                                canteen: null,
                                tokenGroup: null
                            })}>
                                <Icons iconName="addcircle" className="icon-15 icon-white me-1" /> New
                            </button>
                        )}

                    </div>
                    <div className="d-flex align-items-center gap-3">
                        <div className="col-12 col-xl-5">
                            <label className="form-label label-required mb-2 font-w500">Canteen Name</label>
                            <Controller
                                name={`foodListManagement.canteenTokens.${index}.canteen`}
                                control={control}
                                rules={{ required: "Canteen Name is required" }}
                                render={({ field }) => (
                                    <Selector
                                        {...field}
                                        value={field.value}
                                        onChange={async (val) => {
                                            field.onChange(val ?? undefined);
                                            setTokenGroups([]);
                                            await getTokenListData(val as SelectOption);
                                            setValue(
                                                `foodListManagement.canteenTokens.${index}.tokenGroup`,
                                                null
                                            );
                                        }}
                                        options={canteens}
                                        isMulti={false}
                                        isClearable={false}
                                    />

                                )}
                            />
                            {errors.foodListManagement?.canteenTokens?.[index]?.canteen && (
                                <span className="text-danger">
                                    {errors.foodListManagement.canteenTokens[index]?.canteen?.message}
                                </span>
                            )}
                        </div>
                        <div className="col-12 col-xl-5">
                            <label className="form-label label-required mb-2 font-w500">Token Group</label>
                            <Controller
                                name={`foodListManagement.canteenTokens.${index}.tokenGroup`}
                                control={control}
                                rules={{ required: 'Token Group is required' }}
                                render={({ field }) => (
                                    <Selector
                                        {...field}
                                        value={field.value}
                                        onChange={(val) => field.onChange(val)}
                                        options={tokenGroups}
                                        isMulti={false}
                                        isClearable={false}
                                    />
                                )}
                            />
                            {errors.foodListManagement?.canteenTokens?.[index]?.tokenGroup && (
                                <span className="text-danger">
                                    {errors.foodListManagement.canteenTokens[index]?.tokenGroup?.message}
                                </span>
                            )}
                        </div>
                        {index > 0 && (
                            <div className='delete-icon-bg border ms-3 mt-3' onClick={() => remove(index)}>
                                <a><Icons iconName="delete" className="icon-15" /></a>
                            </div>
                        )}
                    </div>

                </div>
            ))}

            {
                type !== "edit" ?
                    <><div className='col-md-12 d-flex align-items-center mt-5 mb-3 gap-3'>
                        <label className="font-s16 mb-1 font-w500">Pricing</label>
                        <div className="session-custom-border flex-grow-1"></div>
                    </div><div className="row mb-3 g-3">
                            <div className="col-12 col-xl-5 mb-3">
                                <label className="form-label label-required mb-2 font-w500">Price (Internal)</label>
                                <Controller
                                    name="foodListManagement.price.internal.rate"
                                    control={control}
                                    rules={{ required: "Price (Internal) is required" }}
                                    render={({ field }) => (
                                        <InputText type="number" className="form-control" {...field} value={field.value || ''} />
                                    )} />
                                {errors.foodListManagement?.price?.internal?.rate?.message && (
                                    <span className="text-danger">{errors.foodListManagement.price.internal.rate.message}</span>
                                )}
                            </div>
                            <div className="col-6 col-xl-3 mb-3">
                                <label className="form-label label-required mb-2 font-w500">GST</label>
                                <Controller
                                    name="foodListManagement.price.internal.gst"
                                    control={control}
                                    rules={{ required: "GST is required" }}
                                    render={({ field }) => (
                                        <InputText type="number" className="form-control" {...field} value={field.value || ''} />
                                    )} />
                                {errors.foodListManagement?.price?.internal?.gst?.message && (
                                    <span className="text-danger">{errors.foodListManagement.price.internal.gst.message}</span>
                                )}
                            </div>
                            <div className="col-6 col-xl-2 mb-3">
                                <label className="form-label label-required mb-2 font-w500">SGST</label>
                                <Controller
                                    name="foodListManagement.price.internal.sgst"
                                    control={control}
                                    rules={{ required: "SGST is required" }}
                                    render={({ field }) => (
                                        <InputText type="number" className="form-control" {...field} value={field.value || ''} />
                                    )} />
                                {errors.foodListManagement?.price?.internal?.sgst?.message && (
                                    <span className="text-danger">{errors.foodListManagement.price.internal.sgst.message}</span>
                                )}
                            </div>
                            <div className="col-12 col-xl-5 mb-3">
                                <label className="form-label label-required mb-2 font-w500">Price (External)</label>
                                <Controller
                                    name="foodListManagement.price.external.rate"
                                    control={control}
                                    rules={{ required: "Price (External) is required" }}
                                    render={({ field }) => (
                                        <InputText type="number" className="form-control" {...field} value={field.value || ''} />
                                    )} />
                                {errors.foodListManagement?.price?.external?.rate?.message && (
                                    <span className="text-danger">{errors.foodListManagement.price.external.rate.message}</span>
                                )}
                            </div>
                            <div className="col-6 col-xl-3 mb-3">
                                <label className="form-label label-required mb-2 font-w500">GST</label>
                                <Controller
                                    name="foodListManagement.price.external.gst"
                                    control={control}
                                    rules={{ required: "GST is required" }}
                                    render={({ field }) => (
                                        <InputText type="number" className="form-control" {...field} value={field.value || ''} />
                                    )} />
                                {errors.foodListManagement?.price?.external?.gst?.message && (
                                    <span className="text-danger">{errors.foodListManagement.price.external.gst.message}</span>
                                )}
                            </div>
                            <div className="col-6 col-xl-2 mb-3">
                                <label className="form-label label-required mb-2 font-w500">SGST</label>
                                <Controller
                                    name="foodListManagement.price.external.sgst"
                                    control={control}
                                    rules={{ required: "SGST is required" }}
                                    render={({ field }) => (
                                        <InputText type="number" className="form-control" {...field} value={field.value || ''} />
                                    )} />
                                {errors.foodListManagement?.price?.external?.sgst?.message && (
                                    <span className="text-danger">{errors.foodListManagement.price.external.sgst.message}</span>
                                )}
                            </div>
                        </div></> : null
            }
            <div className="col-md-12 column mt-3">
                <h6>Attachments (Max 2MB)</h6>
                <div className="col-md-5 my-3">
                    <Controller
                        name="foodListManagement.img"
                        control={control}
                        rules={{
                            required: "Please upload at least one file",
                        }}
                        render={({ field }) => (


                            <div>
                                {id && (
                                    <img
                                        src={
                                            selectedFile
                                                ? URL.createObjectURL(selectedFile)
                                                : getValues("foodListManagement.img")
                                        }
                                        alt="uploaded"
                                        className="img-preview mb-3"
                                        width="100px"
                                    />
                                )}


                                {!id ? (
                                    <Dropzone
                                        accept={{
                                            "image/*": [".jpg", ".jpeg", ".png"],
                                        }}
                                        maxFiles={1}
                                        maxSize={2 * 1024 * 1024}
                                        multiple={true}
                                        acceptedFiles={field.value}
                                        fileRejections={fileRejection}
                                        onDrop={(acceptedFiles, rejectedFiles) => {
                                            const newFiles = acceptedFiles.filter(
                                                (f) => !field.value?.some((file) => file.name === f.name)
                                            );
                                            field.onChange([...field.value, ...newFiles]);
                                            setFileRejections(rejectedFiles);
                                        }}
                                        onFileRemove={(fileName) => {
                                            field.onChange(field.value.filter((f) => f.name !== fileName));
                                        }}
                                        acceptedFileClassName="list-group-item-success"
                                        rejectedFileClassName="list-group-item-danger"
                                    />
                                ) : (
                                    <div>
                                        <button
                                            {...getRootProps()}
                                            type="button"
                                            className="add-item-master btn dropdown-btn dropdown-btn-square m-0 text-gray"
                                        >
                                            <div className="d-flex align-items-center">
                                                <Icons iconName="Select_file" className="icon-16 me-1" />
                                                <span>Update image</span>
                                            </div>
                                        </button>
                                        <input
                                            {...getInputProps({
                                                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;
                                                    setSelectedFile(file);
                                                    field.onChange(file);
                                                    setValue(`foodListManagement.img`, [file]);
                                                },
                                            })}
                                        />

                                    </div>
                                )}

                                {errors.foodListManagement?.img && (
                                    <span className="text-danger">
                                        {errors.foodListManagement.img.message}
                                    </span>
                                )}
                            </div>

                        )}
                    />
                </div>
            </div>
        </>
    );
};

export default AddItemForm;
