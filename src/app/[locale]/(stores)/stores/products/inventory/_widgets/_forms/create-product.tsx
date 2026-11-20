'use client'

import * as z from 'zod'
import { useState, useRef } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form } from '@/components/ui/form'
import InputsTemplate from '@/components/templates/inputs'
import ButtonTemplate from '@/components/templates/button'
import { SelectTemplate } from '@/components/templates/select-template'
import { Plus, Minus } from 'lucide-react'
import { useAxios } from '@/hooks/use-axios'
import { ProductServices } from '../../_logics/services'
import { useFetchData } from '@/hooks/use-fetch'
import { UnitServices, WarehouseServices } from '../../../categories/_logics/services'
import { IGeneric } from '@/types/interfaces'
import { useBilling } from '@/lib/subscription/client'
import { DEFAULT_FEE_CLASS, FEE_CLASSES, FEE_CLASS_KEYS, feeClassOf, percent, type FeeClass } from '@/lib/subscription/usage'
import TagInput from './tag-input'
import ProductRecognition from './product-recognition'
import {
  buildCreateProductPayload,
  buildUnitPayload,
  buildUpdateProductPayload,
  isDuplicateSkuError,
  productSaveErrorMessage,
  SKU_IN_USE,
  unitCosts,
} from '../../_logics/product-payload'

const isValidBarcode = (code: string) => (/^[\x21-\x7E]{1,64}$/.test(code) ? null : '1–64 printable characters, no spaces')

const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  description: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  feeClass: z.enum(FEE_CLASS_KEYS as [FeeClass, ...FeeClass[]]).default(DEFAULT_FEE_CLASS),
  purchasePrice: z.coerce.number().min(0, 'Required'),
  minQuantity: z.coerce.number().int().optional(),
  brand: z.string().trim().max(120).optional(),
  sku: z.string().trim().max(64).optional(),
  imageUrl: z.union([z.literal(''), z.string().trim().url('Enter a valid URL (https://…)')]).optional(),
  aliases: z.array(z.string().trim().min(1).max(120)).optional(),
  units: z
    .array(
      z.object({
        unitId: z.coerce.number().min(1, 'Unit required'),
        retailPrice: z.coerce.number().min(0, 'Required'),
        wholesalePrice: z.coerce.number().min(0, 'Required'),
        pricingRule: z.enum(['flat', 'half-box', 'bulk-wholesale']).default('flat'),
        baseQuantity: z.coerce.number().int('Whole number').min(1, 'At least 1').default(1),
        barcodes: z.array(z.string()).optional(),
        boxSize: z.coerce.number().int().optional(),
        boxRetailPrice: z.coerce.number().optional(),
        bulkThreshold: z.coerce.number().int().optional(),
      })
    )
    .min(1, 'At least one selling unit required'),
  stock: z
    .array(
      z.object({
        warehouseId: z.coerce.number().min(1, 'Warehouse is required'),
        quantity: z.coerce.number().min(1, 'Quantity is required'),
      })
    )
    .min(1),
})

type ProductForm = z.infer<typeof productSchema>

interface CreateProductProps {
  mode?: 'create' | 'update'
  productId?: number
  initialData?: any // accepts both ProductForm shape and raw API shape
  onSuccess?: () => void
}

const categoryOptions = [
  { text: 'Pack', value: 'packs' },
  { text: 'Box', value: 'box' },
  { text: 'Bundles', value: 'bundles' },
  { text: 'Canned', value: 'canned' },
  { text: 'Bottles', value: 'bottles' },
]

const pricingRuleOptions = [
  { text: 'Flat – fixed price', value: 'flat' },
  { text: 'Half-box – ½ price at half qty', value: 'half-box' },
  { text: 'Bulk wholesale – wholesale at qty N+', value: 'bulk-wholesale' },
]

const BOX_KEYWORDS = ['box', 'carton', 'bottle', 'pack', 'bundle']
const isBoxUnit = (name: string) => BOX_KEYWORDS.some((k) => name.toLowerCase().includes(k))

interface UnitRowProps {
  index: number
  fieldId: string
  control: any
  unitOptions: { text: string; value: string }[]
  showLabels: boolean
  canRemove: boolean
  onRemove: () => void
  pieceUnitId: string
  onAddPieceUnit: (pieceUnitId: string, piecePrice: number, boxSizeNum: number, boxRetailPrice: number) => void
  mode: 'create' | 'update'
}

const UnitRow = ({ index, fieldId, control, unitOptions, showLabels, canRemove, onRemove, mode }: UnitRowProps) => {
  const rule = useWatch({ control, name: `units.${index}.pricingRule` })

  return (
    <div key={fieldId} className="flex flex-col gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50">
      {/* Main unit row */}
      <div className="grid grid-cols-4 gap-2 items-end">
        <SelectTemplate
          control={control}
          name={`units.${index}.unitId`}
          label={showLabels ? 'Unit' : undefined}
          placeholder="Unit"
          content={unitOptions}
        />
        <InputsTemplate
          control={control}
          name={`units.${index}.retailPrice`}
          label={showLabels ? 'Retail Price' : undefined}
          placeholder="0.00"
          inputType="number"
          isRequired
        />
        <InputsTemplate
          control={control}
          name={`units.${index}.wholesalePrice`}
          label={showLabels ? 'Wholesale Price' : undefined}
          placeholder="0.00"
          inputType="number"
          isRequired
        />
        <div className="flex items-end gap-1">
          <div className="flex-1">
            <SelectTemplate
              control={control}
              name={`units.${index}.pricingRule`}
              label={showLabels ? 'Pricing Rule' : undefined}
              placeholder="Rule"
              content={pricingRuleOptions}
            />
          </div>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="mb-1 p-1.5 rounded-md border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors flex-shrink-0"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Half-box fields — shown when half-box pricing rule is selected */}
      {rule === 'half-box' && (
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-200 mt-1">
          <InputsTemplate
            control={control}
            name={`units.${index}.boxSize`}
            label="Pieces per full box"
            placeholder="e.g. 10"
            inputType="number"
            isRequired
          />
          <InputsTemplate
            control={control}
            name={`units.${index}.boxRetailPrice`}
            label="Full box retail price (₵)"
            placeholder="e.g. 300"
            inputType="number"
            isRequired
          />
        </div>
      )}

      {/* Wholesale threshold — only for flat / bulk-wholesale, not for half-box pieces */}
      {rule !== 'half-box' && (
        <div className="flex items-center gap-2">
          <label className="bytewave-paragraph text-xs text-gray-500 whitespace-nowrap">Wholesale from qty</label>
          <div className="w-24">
            <InputsTemplate control={control} name={`units.${index}.bulkThreshold`} placeholder="e.g. 5" inputType="number" />
          </div>
          <p className="bytewave-paragraph text-xs text-gray-400">At this qty, price switches to wholesale</p>
        </div>
      )}

      {/* Stock is counted in base units; a Box of 12 consumes 12 */}
      <div className="flex items-center gap-2">
        <label className="bytewave-paragraph text-xs text-gray-500 whitespace-nowrap">Base quantity</label>
        <div className="w-24">
          <InputsTemplate control={control} name={`units.${index}.baseQuantity`} placeholder="1" inputType="number" />
        </div>
        <p className="bytewave-paragraph text-xs text-gray-400">How many base units this unit contains, e.g. Box = 12</p>
      </div>

      {mode === 'create' && (
        <TagInput
          control={control}
          name={`units.${index}.barcodes`}
          placeholder="Barcodes printed on this unit (Enter to add)"
          validate={isValidBarcode}
          mono
        />
      )}
    </div>
  )
}

const CreateProduct = ({ mode = 'create', productId, initialData, onSuccess }: CreateProductProps) => {
  const request = useAxios()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Store ProductUnit record IDs (from API) mapped by form array index
  // Used in update mode to call PUT /products/:id/units/:recordId
  const unitRecordIds = useRef<Record<number, number>>({})
  if (mode === 'update' && initialData?.units) {
    ;(initialData.units as any[]).forEach((u: any, i: number) => {
      if (u.id) unitRecordIds.current[i] = u.id
    })
  }

  // Pay as you sell charges by the product's fee type, so the field shows only on that plan.
  const usagePricing = useBilling().access.plan?.usage

  const { data: unitsData } = useFetchData('units', UnitServices.FetchAll() as unknown as IGeneric)
  const unitOptions = ((unitsData as any[] | undefined) ?? []).map((u: any) => ({ text: u.name, value: String(u.id) }))

  // Auto-detect the "Piece" unit type by name
  const pieceUnit = ((unitsData as any[] | undefined) ?? []).find((u: any) => u.name.toLowerCase().includes('piece'))
  const pieceUnitId = pieceUnit ? String(pieceUnit.id) : ''

  const { data: warehousesData } = useFetchData('warehouses', WarehouseServices.FetchAll() as unknown as IGeneric)
  const warehouseOptions = ((warehousesData as any[] | undefined) ?? []).map((w: any) => ({ text: w.name, value: String(w.id) }))

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: initialData?.name ?? '',
      description: initialData?.description ?? '',
      category: initialData?.category ?? '',
      // Kept as saved even when the field isn't shown, so editing never resets it.
      feeClass: feeClassOf(initialData?.feeClass),
      purchasePrice: initialData?.purchasePrice ?? 0,
      minQuantity: initialData?.minQuantity ?? undefined,
      brand: initialData?.brand ?? '',
      sku: initialData?.sku ?? '',
      imageUrl: initialData?.imageUrl ?? '',
      aliases: [],
      // Map API units (which have id, unitId, unitName, ...) to form units
      units: (initialData?.units as any[] | undefined)?.map((u: any) => ({
        unitId: u.unitId ?? u.unit_id ?? 0,
        retailPrice: u.retailPrice ?? 0,
        wholesalePrice: u.wholesalePrice ?? 0,
        pricingRule: u.pricingRule ?? 'flat',
        baseQuantity: u.baseQuantity ?? 1,
        boxSize: u.boxSize ?? undefined,
        boxRetailPrice: u.boxRetailPrice ?? undefined,
        bulkThreshold: u.bulkThreshold ?? undefined,
        barcodes: [],
      })) ?? [{ unitId: 0, retailPrice: 0, wholesalePrice: 0, pricingRule: 'flat', baseQuantity: 1, barcodes: [] }],
      stock: initialData?.stock ?? [{ warehouseId: 0, quantity: 0 }],
    },
  })

  const { fields: unitFields, append: appendUnit, remove: removeUnit } = useFieldArray({ control: form.control, name: 'units' })

  const { fields: stockFields, append: appendStock, remove: removeStock } = useFieldArray({ control: form.control, name: 'stock' })

  const handleAddPieceUnit = (detectedPieceUnitId: string, piecePrice: number, boxSizeNum: number, boxRetailPrice: number) => {
    appendUnit({
      unitId: detectedPieceUnitId ? Number(detectedPieceUnitId) : 0,
      retailPrice: piecePrice,
      wholesalePrice: piecePrice,
      pricingRule: 'half-box',
      baseQuantity: 1,
      boxSize: boxSizeNum,
      boxRetailPrice,
      // pieces never have a wholesale threshold — half-box rule only
    })
  }

  const onSubmit = async (data: ProductForm) => {
    setSubmitError('')
    setIsSubmitting(true)
    try {
      if (mode === 'update' && productId) {
        // 1. Product fields (no units/stock). Unchanged brand/sku/imageUrl are omitted; "" clears the SKU.
        await request(ProductServices.Update(productId, buildUpdateProductPayload(data, initialData ?? {})))

        // 2. Each unit: update existing, create new ones added during edit.
        for (let i = 0; i < data.units.length; i++) {
          const recordId = unitRecordIds.current[i]
          const unitPayload = buildUnitPayload(data.units[i])
          if (recordId) await request(ProductServices.UpdateUnit(productId, recordId, unitPayload))
          else await request(ProductServices.AddUnit(productId, unitPayload))
        }
      } else {
        // Create — full payload including units, stock, aliases and barcodes.
        await request(ProductServices.Create(buildCreateProductPayload(data)))
      }
      form.reset()
      onSuccess?.()
    } catch (err: any) {
      // The form keeps its values on any error; a duplicate SKU is shown on the field.
      if (isDuplicateSkuError(err)) form.setError('sku', { type: 'server', message: SKU_IN_USE }, { shouldFocus: true })
      else setSubmitError(productSaveErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const imageUrl = form.watch('imageUrl')
  const feeClass = form.watch('feeClass')
  const watchedUnits = form.watch('units')
  const purchasePrice = Number(form.watch('purchasePrice')) || 0
  const unitName = (id: number) => unitOptions.find((o) => o.value === String(id))?.text ?? 'Unit'
  const costs = unitCosts(
    purchasePrice,
    (watchedUnits ?? []).map((u) => ({
      ...u,
      retailPrice: Number(u.retailPrice) || 0,
      baseQuantity: Number(u.baseQuantity) || 1,
      boxSize: Number(u.boxSize) || undefined,
    }))
  )

  return (
    <div className="flex flex-col gap-2">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
          <div className="flex flex-col gap-4 py-2 flex-1">
            {/* ── Product details ── */}
            <InputsTemplate control={form.control} name="name" label="Product Name" placeholder="e.g. Coca-Cola 330ml" isRequired />
            <InputsTemplate
              control={form.control}
              name="description"
              label="Description"
              placeholder="Brief description..."
              isTextarea
              rowsHeight={2}
            />
            <div className="grid grid-cols-3 gap-4">
              <SelectTemplate
                control={form.control}
                name="category"
                label="Category"
                placeholder="Select category"
                content={categoryOptions}
              />
              <InputsTemplate
                control={form.control}
                name="purchasePrice"
                label="Purchase Price (cost of one box)"
                placeholder="0.00"
                inputType="number"
                isRequired
              />
              <InputsTemplate
                control={form.control}
                name="minQuantity"
                label="Min Qty (stock alert)"
                placeholder="e.g. 10"
                inputType="number"
              />
            </div>

            {usagePricing && (
              <div>
                <SelectTemplate
                  control={form.control}
                  name="feeClass"
                  label="Fee type (Pay as you sell)"
                  content={FEE_CLASSES.map((c) => ({
                    text: `${c.label} · ${percent(usagePricing.rates.retail[c.key])}`,
                    value: c.key,
                  }))}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {FEE_CLASSES.find((c) => c.key === feeClass)?.examples}. The service fee on this product’s sales.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <InputsTemplate control={form.control} name="brand" label="Brand" placeholder="e.g. Kasapreko" />
              <InputsTemplate control={form.control} name="sku" label="SKU" placeholder="e.g. ALOMO-200" />
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <InputsTemplate control={form.control} name="imageUrl" label="Image URL" placeholder="https://…" />
              </div>
              {imageUrl && /^https?:\/\//.test(imageUrl) && (
                // eslint-disable-next-line @next/next/no-img-element -- arbitrary tenant image URL
                <img src={imageUrl} alt="" className="w-10 h-10 rounded-md object-cover border border-gray-200 mb-0.5" />
              )}
            </div>
            {mode === 'create' && (
              <TagInput
                control={form.control}
                name="aliases"
                label="Also known as"
                placeholder="e.g. HappyMan, H-Man (Enter to add)"
                help="Alternate names help the camera recognise this product."
              />
            )}

            {/* ── Selling units ── */}
            <div className="flex flex-col gap-2">
              <p className="bytewave-paragraph text-endeavour font-mulish-regular">Selling Units</p>

              {unitFields.map((field, index) => (
                <UnitRow
                  key={field.id}
                  fieldId={field.id}
                  index={index}
                  control={form.control}
                  unitOptions={unitOptions}
                  showLabels={index === 0}
                  canRemove={unitFields.length > 1}
                  onRemove={() => removeUnit(index)}
                  pieceUnitId={pieceUnitId}
                  onAddPieceUnit={handleAddPieceUnit}
                  mode={mode}
                />
              ))}

              {purchasePrice > 0 && (watchedUnits?.length ?? 0) > 0 && (
                <div
                  role="note"
                  aria-label="Cost per unit"
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600"
                >
                  <p className="font-semibold text-stone-700">Cost per unit</p>
                  <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {watchedUnits.map((u, i) => (
                      <li key={i} className={costs.costs[i]?.loss ? 'font-semibold text-red-600' : undefined}>
                        {u.unitId ? unitName(u.unitId) : `Unit ${i + 1}`}: ₵{costs.costs[i]?.cost.toFixed(2)}
                        {costs.costs[i]?.loss ? ` — more than its ₵${Number(u.retailPrice).toFixed(2)} price` : ''}
                      </li>
                    ))}
                  </ul>
                  {costs.unknownSplit && (
                    <p className="mt-1.5 text-amber-700">
                      Set the box&apos;s Base quantity (e.g. 20 pieces), or Pieces per full box on a half-box unit, so the cost of the
                      smaller units can be worked out.
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  appendUnit({ unitId: 0, retailPrice: 0, wholesalePrice: 0, pricingRule: 'flat', baseQuantity: 1, barcodes: [] })
                }
                className="flex items-center gap-1.5 text-sm text-endeavour bytewave-paragraph hover:underline w-fit mt-1"
              >
                <Plus className="h-4 w-4" />
                Add selling unit
              </button>
            </div>

            {/* ── Stock locations — only on create; managed via Stocks tab on edit ── */}
            {mode === 'create' && (
              <div className="flex flex-col gap-2">
                <p className="bytewave-paragraph text-endeavour font-mulish-regular">Stock Locations</p>
                {stockFields.map((field, index) => (
                  <div key={field.id} className="flex items-end gap-2">
                    <div className="flex-1">
                      <SelectTemplate
                        control={form.control}
                        name={`stock.${index}.warehouseId`}
                        label={index === 0 ? 'Warehouse' : undefined}
                        placeholder="Select warehouse"
                        content={warehouseOptions}
                      />
                    </div>
                    <div className="w-28">
                      <InputsTemplate
                        control={form.control}
                        name={`stock.${index}.quantity`}
                        label={index === 0 ? 'Quantity' : undefined}
                        placeholder="0"
                        inputType="number"
                        isRequired
                      />
                    </div>
                    {stockFields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStock(index)}
                        className="mb-2 p-1.5 rounded-md border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => appendStock({ warehouseId: 0, quantity: 0 })}
                  className="flex items-center gap-1.5 text-sm text-endeavour bytewave-paragraph hover:underline w-fit mt-1"
                >
                  <Plus className="h-4 w-4" />
                  Add location
                </button>
              </div>
            )}
          </div>

          <div className="mt-auto border-t border-gray-200 pt-4 pb-2 flex flex-col gap-2">
            {submitError && <p className="text-sm text-red-500">{submitError}</p>}
            <ButtonTemplate
              isText
              text={isSubmitting ? 'Saving...' : mode === 'update' ? 'Update Product' : 'Save Product'}
              type="submit"
              isDisabled={isSubmitting}
            />
          </div>
        </form>
      </Form>
      {mode === 'update' && productId && (
        <ProductRecognition
          productId={productId}
          units={((initialData?.units as any[] | undefined) ?? [])
            .filter((u: any) => u.id)
            .map((u: any) => ({ id: Number(u.id), name: u.unitName ?? `Unit ${u.id}` }))}
        />
      )}
    </div>
  )
}

export default CreateProduct
