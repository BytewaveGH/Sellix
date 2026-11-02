'use client'

import * as z from 'zod'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import InputsTemplate from '@/components/templates/inputs'
import ButtonTemplate from '@/components/templates/button'
import { useAxios } from '@/hooks/use-axios'
import { Check, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { matchingPreset, presetValues, staffModule } from '@/lib/staff-roles'
import { EmployeeServices, generatePassword, PASSWORD_MIN, passwordProblems } from '@/lib/account'
import { apiErrorMessage, apiStatus } from '@/lib/api-error'

// The server answers a taken email with a raw unique-constraint 500 today.
const saveError = (err: unknown) => {
  const msg = apiErrorMessage(err, '')
  if (apiStatus(err) === 409 || /unique|duplicate|already/i.test(msg)) return 'Someone on your team already uses this email'
  if (apiStatus(err) === 402) return 'All staff seats on your plan are in use'
  return msg || 'Something went wrong'
}

// Sign-in is by email. The password is set here on create only; existing
// staff get a new one from Team › Reset password.
const employeeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  phone: z.string().optional(),
  password: z.string().optional(),
  canViewReports: z.boolean().default(false),
  canManageProducts: z.boolean().default(false),
  canManageStock: z.boolean().default(false),
  canManageSales: z.boolean().default(false),
  canManageInvoices: z.boolean().default(false),
  canManageOperations: z.boolean().default(false),
  canManageWarehouses: z.boolean().default(false),
  canManageEmployees: z.boolean().default(false),
})

type EmployeeForm = z.infer<typeof employeeSchema>

interface CreateEmployeeProps {
  // The business's module: decides which permissions are shown and what they're called.
  appType?: string
  mode?: 'create' | 'update'
  employeeId?: number
  initialData?: Partial<EmployeeForm> & Record<string, any>
  onSuccess?: () => void
}

const CreateEmployee = ({ appType, mode = 'create', employeeId, initialData, onSuccess }: CreateEmployeeProps) => {
  const staff = staffModule(appType)
  const request = useAxios()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const form = useForm<EmployeeForm>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      name: initialData?.name ?? '',
      email: initialData?.email ?? '',
      phone: initialData?.phone ?? '',
      password: '',
      canViewReports: initialData?.canViewReports ?? false,
      canManageProducts: initialData?.canManageProducts ?? false,
      canManageStock: initialData?.canManageStock ?? false,
      canManageSales: initialData?.canManageSales ?? false,
      canManageInvoices: initialData?.canManageInvoices ?? false,
      canManageOperations: initialData?.canManageOperations ?? false,
      canManageWarehouses: initialData?.canManageWarehouses ?? false,
      canManageEmployees: initialData?.canManageEmployees ?? false,
    },
  })

  // Re-sync form when switching between employees (sheet stays mounted)
  const initKey = initialData?.id ?? 'new'
  useEffect(() => {
    form.reset({
      name: initialData?.name ?? '',
      email: initialData?.email ?? '',
      phone: initialData?.phone ?? '',
      password: '',
      canViewReports: initialData?.canViewReports ?? false,
      canManageProducts: initialData?.canManageProducts ?? false,
      canManageStock: initialData?.canManageStock ?? false,
      canManageSales: initialData?.canManageSales ?? false,
      canManageInvoices: initialData?.canManageInvoices ?? false,
      canManageOperations: initialData?.canManageOperations ?? false,
      canManageWarehouses: initialData?.canManageWarehouses ?? false,
      canManageEmployees: initialData?.canManageEmployees ?? false,
    })
    setSubmitError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initKey])

  const values = form.watch()
  const activePreset = matchingPreset(staff, values)

  const onSubmit = async (data: EmployeeForm) => {
    if (mode === 'create') {
      const problem = passwordProblems({ next: data.password ?? '', confirm: data.password ?? '' }, false).next
      if (problem) {
        form.setError('password', { message: problem })
        return
      }
    }

    setSubmitError('')
    setIsSubmitting(true)
    try {
      const payload: any = { ...data }
      if (mode === 'update') delete payload.password

      if (mode === 'update' && employeeId) {
        await request(EmployeeServices.Update(employeeId, payload))
      } else {
        await request(EmployeeServices.Create(payload))
      }
      form.reset()
      onSuccess?.()
    } catch (err: any) {
      setSubmitError(saveError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
        <div className="flex flex-col gap-5 py-2 flex-1 overflow-y-auto pr-1">
          {/* Basic info */}
          <section>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Basic Info</p>
            <div className="flex flex-col gap-3">
              <InputsTemplate control={form.control} name="name" label="Full Name" placeholder="e.g. Kwame Mensah" isRequired />
              <InputsTemplate
                control={form.control}
                name="email"
                label="Email"
                placeholder="e.g. kwame@business.com"
                isRequired
                inputType="email"
              />
              <InputsTemplate control={form.control} name="phone" label="Phone" placeholder="e.g. +233 24 000 0000" inputType="tel" />
              {mode === 'create' && (
                <div className="flex flex-col gap-1">
                  <InputsTemplate
                    control={form.control}
                    name="password"
                    label="Password"
                    placeholder={`At least ${PASSWORD_MIN} characters, with a number`}
                    isRequired
                    isPassword
                  />
                  <button
                    type="button"
                    onClick={() => form.setValue('password', generatePassword(), { shouldDirty: true })}
                    className="self-start text-xs font-semibold text-endeavour hover:underline"
                  >
                    Suggest a password
                  </button>
                  <p className="text-[11px] text-gray-400">
                    They sign in with their email and this password, and can change it in My account.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Permissions */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-3.5 w-3.5 text-endeavour" />
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Permissions</p>
            </div>

            {/* Role preset quick-fill */}
            <div className="flex flex-col gap-1.5 mb-3">
              <p className="text-[10px] text-gray-400">Quick roles — tap to fill:</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick roles">
                {staff.presets.map((role) => {
                  const on = activePreset?.label === role.label
                  return (
                    <button
                      key={role.label}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        Object.entries(presetValues(role)).forEach(([key, value]) =>
                          form.setValue(key as keyof EmployeeForm, value, { shouldDirty: true })
                        )
                      }
                      className={cn(
                        'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all active:scale-95',
                        role.color,
                        on && 'ring-2 ring-offset-1 ring-endeavour/40'
                      )}
                    >
                      {on && <Check className="h-3 w-3" />}
                      {role.label}
                      <span className="opacity-60 font-normal">— {role.description}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-col rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
              {staff.permissions.map(({ key, label, description, icon: Icon, color }) => (
                <FormField
                  key={key}
                  control={form.control}
                  name={key}
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between space-y-0 px-3 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={cn('p-1.5 rounded-lg flex-shrink-0', color)}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <FormLabel className="block text-sm text-stone-700 font-medium cursor-pointer leading-tight m-0">
                            {label}
                          </FormLabel>
                          <p className="text-[11px] text-gray-400 leading-snug mt-0.5">{description}</p>
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          aria-label={label}
                          checked={field.value as boolean}
                          onCheckedChange={field.onChange}
                          className="data-[state=checked]:bg-endeavour"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-auto border-t border-gray-200 pt-4 pb-2 flex flex-col gap-2">
          {submitError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{submitError}</p>}
          <ButtonTemplate
            isText
            text={isSubmitting ? 'Saving...' : mode === 'update' ? 'Update Employee' : 'Add Employee'}
            type="submit"
            isDisabled={isSubmitting}
          />
        </div>
      </form>
    </Form>
  )
}

export default CreateEmployee
