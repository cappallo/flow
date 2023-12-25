import { Overlay } from '@literal-ui/core'
import clsx from 'clsx'
import React, { useCallback, useRef, useState, useEffect } from 'react'
import FocusLock from 'react-focus-lock'
import {
  MdCopyAll,
  MdOutlineAddBox,
  MdOutlineEdit,
  MdOutlineIndeterminateCheckBox,
  MdSearch,
} from 'react-icons/md'
import { useSnapshot } from 'valtio'

import { typeMap, colorMap } from '../annotation'
import {
  isForwardSelection,
  useMobile,
  useSetAction,
  useTextSelection,
  useTranslation,
  useTypography,
} from '../hooks'
import { BookTab } from '../models'
import { isTouchScreen, scale } from '../platform'
import { copy, keys, last } from '../utils'

import { Button, IconButton } from './Button'
import { TextField } from './Form'
import { layout, LayoutAnchorMode, LayoutAnchorPosition } from './base'
import { decode } from 'he'

interface TextSelectionMenuProps {
  tab: BookTab
}
export const TextSelectionMenu: React.FC<TextSelectionMenuProps> = ({
  tab,
}) => {
  const { rendition, annotationRange } = useSnapshot(tab)

  // `manager` is not reactive, so we need to use getter
  const view = useCallback(() => {
    return rendition?.manager?.views._views[0]
  }, [rendition])

  const win = view()?.window
  const [selection, setSelection] = useTextSelection(win)

  const el = view()?.element as HTMLElement
  if (!el) return null

  // it is possible that both `selection` and `tab.annotationRange`
  // are set when select end within an annotation
  const range = selection?.getRangeAt(0) ?? annotationRange
  if (!range) return null

  // prefer to display above the selection to avoid text selection helpers
  // https://stackoverflow.com/questions/68081757/hide-the-two-text-selection-helpers-in-mobile-browsers
  const forward = isTouchScreen
    ? false
    : selection
    ? isForwardSelection(selection)
    : true

  const rects = [...range.getClientRects()].filter((r) => Math.round(r.width))
  const anchorRect = rects && (forward ? last(rects) : rects[0])
  if (!anchorRect) return null

  const handleTranslateClick = async (highlightedText) => {
    const targetLanguage = 'en'
    const apiUrl = `/cgi-bin/fluduku.py?keyword=bone&text=${encodeURIComponent(
      highlightedText,
    )}&target=${encodeURIComponent(targetLanguage)}`

    try {
      console.time('FetchTime')
      const response = await fetch(apiUrl)
      console.timeEnd('FetchTime')
      const data = await response.json()
      console.log('got translation: ', decode(data.output))
      return decode(data.output) // Return the translation
    } catch (error) {
      console.error('Translation error:', error)
      throw error // Propagate the error
    }
  }

  const contents = range.cloneContents()
  const text = contents.textContent?.trim()
  if (!text) return null

  return (
    // to reset inner state
    <TextSelectionMenuRenderer
      tab={tab}
      range={range as Range}
      anchorRect={anchorRect}
      containerRect={el.parentElement!.getBoundingClientRect()}
      viewRect={el.getBoundingClientRect()}
      text={text}
      forward={forward}
      hide={() => {
        if (selection) {
          selection.removeAllRanges()
          setSelection(undefined)
        }
        /**
         * {@link range}
         */
        if (tab.annotationRange) {
          tab.annotationRange = undefined
        }
      }}
      handleTranslateClick={handleTranslateClick}
    />
  )
}

const ICON_SIZE = scale(22, 28)
const ANNOTATION_SIZE = scale(24, 30)

interface TextSelectionMenuRendererProps {
  tab: BookTab
  range: Range
  anchorRect: DOMRect
  containerRect: DOMRect
  viewRect: DOMRect
  text: string
  forward: boolean
  hide: () => void
}
const TextSelectionMenuRenderer: React.FC<TextSelectionMenuRendererProps> = ({
  tab,
  range,
  anchorRect,
  containerRect,
  viewRect,
  forward,
  text,
  hide,
  handleTranslateClick,
}) => {
  const setAction = useSetAction()
  const ref = useRef<HTMLInputElement>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const mobile = useMobile()
  const t = useTranslation('menu')

  const cfi = tab.rangeToCfi(range)
  const annotation = tab.book.annotations.find((a) => a.cfi === cfi)
  const [annotate, setAnnotate] = useState(!!annotation)

  const position = forward
    ? LayoutAnchorPosition.Before
    : LayoutAnchorPosition.After

  const { zoom } = useTypography(tab)
  const endContainer = forward ? range.endContainer : range.startContainer
  const _lineHeight = parseFloat(
    getComputedStyle(endContainer.parentElement!).lineHeight,
  )
  // no custom line height and the origin is keyword, e.g. 'normal'.
  const lineHeight = isNaN(_lineHeight)
    ? anchorRect.height
    : _lineHeight * (zoom ?? 1)

  const [translation, setTranslation] = useState('')
  const [showTranslation, setShowTranslation] = useState(true)
  const [isTranslating, setIsTranslating] = useState(false)
  const isTranslatingRef = useRef(false)
  const pendingTranslationRef = useRef(null)

  const processTranslation = async (textToTranslate) => {
    isTranslatingRef.current = true
    try {
      const translatedText = await handleTranslateClick(textToTranslate)
      setTranslation(translatedText)
    } catch (error) {
      console.error('Translation error:', error)
    } finally {
      isTranslatingRef.current = false
      if (pendingTranslationRef.current) {
        processTranslation(pendingTranslationRef.current)
        pendingTranslationRef.current = null
      }
    }
  }

  useEffect(() => {
    if (text) {
      if (isTranslatingRef.current) {
        pendingTranslationRef.current = text
      } else {
        processTranslation(text)
      }
    }
  }, [text, handleTranslateClick])

  return (
    <FocusLock disabled={mobile}>
      <Overlay
        // cover `sash`
        className="!z-50 !bg-transparent"
        onMouseDown={hide}
      />
      <div
        ref={(el) => {
          if (!el) return
          setWidth(el.clientWidth)
          setHeight(el.clientHeight)
          if (!mobile) {
            el.focus()
          }
        }}
        className={clsx(
          'bg-surface text-on-surface-variant shadow-1 absolute z-50 p-2 focus:outline-none',
        )}
        style={{
          left: layout(containerRect.width, width, {
            offset: anchorRect.left + viewRect.left - containerRect.left,
            size: anchorRect.width,
            mode: LayoutAnchorMode.ALIGN,
            position,
          }),
          top: layout(containerRect.height, height, {
            offset: anchorRect.top - (lineHeight - anchorRect.height) / 2,
            size: lineHeight,
            position,
          }),
        }}
        tabIndex={-1}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'c' && e.ctrlKey) {
            copy(text)
          }
        }}
      >
        {showTranslation ? (
            <div
              className="notranslate flex cursor-pointer items-center justify-center"
              onClick={() => setShowTranslation(false)}
            >
              {translation || <div className="spinner"></div>}
          </div>
        ) : annotate ? (
          <div className="mb-3">
            <TextField
              mRef={ref}
              as="textarea"
              name="notes"
              defaultValue={annotation?.notes}
              hideLabel
              className="h-40 w-72"
              autoFocus
            />
          </div>
        ) : (
          <div className="text-on-surface-variant -mx- mb-3 flex gap-1">
            <IconButton
              title={t('copy')}
              Icon={MdCopyAll}
              size={ICON_SIZE}
              onClick={() => {
                hide()
                copy(text)
              }}
            />
            <IconButton
              title={t('search_in_book')}
              Icon={MdSearch}
              size={ICON_SIZE}
              onClick={() => {
                hide()
                setAction('search')
                tab.setKeyword(text)
              }}
            />
            <IconButton
              title={t('annotate')}
              Icon={MdOutlineEdit}
              size={ICON_SIZE}
              onClick={() => {
                setAnnotate(true)
              }}
            />
            {tab.isDefined(text) ? (
              <IconButton
                title={t('undefine')}
                Icon={MdOutlineIndeterminateCheckBox}
                size={ICON_SIZE}
                onClick={() => {
                  hide()
                  tab.undefine(text)
                }}
              />
            ) : (
              <IconButton
                title={t('define')}
                Icon={MdOutlineAddBox}
                size={ICON_SIZE}
                onClick={() => {
                  hide()
                  tab.define([text])
                }}
              />
            )}
          </div>
        )}

        {!showTranslation && (
          <div className="space-y-2">
            {keys(typeMap).map((type) => (
              <div key={type} className="flex gap-2">
                {keys(colorMap).map((color) => (
                  <div
                    key={color}
                    style={{
                      [typeMap[type].style]: colorMap[color],
                      width: ANNOTATION_SIZE,
                      height: ANNOTATION_SIZE,
                      fontSize: scale(16, 20),
                    }}
                    className={clsx(
                      'typescale-body-large text-on-surface-variant flex cursor-pointer items-center justify-center',
                      typeMap[type].class,
                    )}
                    onClick={() => {
                      tab.putAnnotation(
                        type,
                        cfi,
                        color,
                        text,
                        ref.current?.value,
                      )
                      hide()
                    }}
                  >
                    A
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {!showTranslation && annotate && (
          <div className="mt-3 flex">
            {annotation && (
              <Button
                compact
                variant="secondary"
                onClick={() => {
                  tab.removeAnnotation(cfi)
                  hide()
                }}
              >
                {t('delete')}
              </Button>
            )}
            <Button
              className="ml-auto"
              compact
              onClick={() => {
                tab.putAnnotation(
                  annotation?.type ?? 'highlight',
                  cfi,
                  annotation?.color ?? 'yellow',
                  text,
                  ref.current?.value,
                )
                hide()
              }}
            >
              {t(annotation ? 'update' : 'create')}
            </Button>
          </div>
        )}
      </div>
    </FocusLock>
  )
}
