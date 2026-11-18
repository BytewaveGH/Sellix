'use client'

import * as z from 'zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormField, FormItem, FormControl } from '@/components/ui/form'
import { Label } from '@radix-ui/react-label'
import InputsTemplate from '@/components/templates/inputs'
import ButtonTemplate from '@/components/templates/button'
import { useAxios } from '@/hooks/use-axios'
import { useFetchData } from '@/hooks/use-fetch'
import { IGeneric } from '@/types/interfaces'
import { LeaderboardServices } from '../../_logics/services'
import { AttractionServices } from '../../../attractions/_logics/services'
import { attractionMetric } from '../../../attractions/_logics/attraction-types'
import { buildBoards, wouldRank } from '@/lib/amusement/leaderboard'
import type { LeaderboardEntry } from '@/lib/amusement/park'
import { Crown, Medal } from 'lucide-react'

const entrySchema = z.object({
  attractionId: z.string().min(1, 'Attraction is required'),
  participantName: z.string().min(1, 'Name is required'),
  teamName: z.string().optional(),
  score: z.coerce.number(),
  achievedAt: z.string().min(1, 'Date is required'),
})

type EntryForm = z.infer<typeof entrySchema>

interface CreateLeaderboardEntryProps {
  onSuccess?: () => void
}

const CreateLeaderboardEntry = ({ onSuccess }: CreateLeaderboardEntryProps) => {
  const request = useAxios()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const { data: attractions } = useFetchData('attractions', AttractionServices.FetchAll() as unknown as IGeneric)

  const form = useForm<EntryForm>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      attractionId: '',
      participantName: '',
      teamName: '',
      score: 0,
      achievedAt: new Date().toISOString().slice(0, 10),
    },
  })

  const selectedAttractionId = form.watch('attractionId')
  const selectedAttraction = ((attractions as unknown as any[]) ?? []).find((a) => String(a.id) === selectedAttractionId)
  const metric = attractionMetric(selectedAttraction?.type)

  // Where this score would land, as it's typed: the fun part of recording one.
  const { data: entries } = useFetchData('leaderboard', LeaderboardServices.FetchAll() as unknown as IGeneric)
  const score = Number(form.watch('score'))
  const board = selectedAttraction
    ? buildBoards(
        ((entries as unknown as LeaderboardEntry[]) ?? []).filter((e) => e.attractionId === selectedAttraction.id),
        () => ({ name: selectedAttraction.name, type: selectedAttraction.type }),
        attractionMetric,
        new Date()
      )[0]
    : undefined
  const rank = selectedAttraction && Number.isFinite(score) && score > 0 ? wouldRank(board, score) : null

  const onSubmit = async (data: EntryForm) => {
    setSubmitError('')
    setIsSubmitting(true)
    try {
      await request(
        LeaderboardServices.Create({
          attractionId: Number(data.attractionId),
          participantName: data.participantName,
          teamName: data.teamName || undefined,
          score: data.score,
          achievedAt: data.achievedAt,
        })
      )
      form.reset()
      onSuccess?.()
    } catch (err: any) {
      setSubmitError(err?.response?.data?.error ?? 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
        <div className="flex flex-col gap-4 py-2 flex-1">
          <FormField
            control={form.control}
            name="attractionId"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="w-full">
                    <Label className="text-endeavour bytewave-paragraph">Attraction</Label>
                    <select
                      {...field}
                      className="w-full border border-grey-100 rounded-lg bytewave-paragraph p-2 mt-2 text-stone-500 bg-white"
                    >
                      <option value="" disabled>
                        Select attraction
                      </option>
                      {((attractions as unknown as any[]) ?? []).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </FormControl>
              </FormItem>
            )}
          />
          <InputsTemplate control={form.control} name="participantName" label="Participant Name" placeholder="e.g. Kwame" isRequired />
          <InputsTemplate control={form.control} name="teamName" label="Team Name (optional)" placeholder="e.g. Thunderbolts" />
          <InputsTemplate
            control={form.control}
            name="score"
            label={selectedAttraction ? `${metric.label}${metric.unit ? ` (${metric.unit})` : ''}` : 'Score'}
            placeholder={metric.higherIsBetter ? 'Higher is better' : 'Lower is better'}
            inputType="number"
            isRequired
          />
          <InputsTemplate control={form.control} name="achievedAt" label="Date" inputType="date" isRequired />
        </div>
        <div className="mt-auto border-t border-gray-200 pt-4 pb-2 flex flex-col gap-2">
          {rank !== null &&
            (rank === 1 ? (
              <p
                className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-extrabold text-white"
                style={{ backgroundImage: 'linear-gradient(135deg, #6D28D9, #DB2777)' }}
              >
                <Crown className="h-4 w-4 text-yellow-300" /> {board ? 'New park record!' : 'First score on the board!'}
              </p>
            ) : (
              <p className="flex items-center justify-center gap-2 rounded-xl bg-violet-50 px-3 py-2.5 text-sm font-bold text-violet-800">
                <Medal className="h-4 w-4" /> Would be #{rank} on the board
              </p>
            ))}
          {submitError && <p className="text-sm text-red-500">{submitError}</p>}
          <ButtonTemplate isText text={isSubmitting ? 'Saving...' : 'Add Entry'} type="submit" isDisabled={isSubmitting} />
        </div>
      </form>
    </Form>
  )
}

export default CreateLeaderboardEntry
