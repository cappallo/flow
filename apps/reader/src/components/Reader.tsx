import { useEventListener } from '@literal-ui/hooks'
import clsx from 'clsx'
import React, {
  ComponentProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { MdChevronRight, MdWebAsset } from 'react-icons/md'
import { RiBookLine } from 'react-icons/ri'
import { PhotoSlider } from 'react-photo-view'
import { useSetRecoilState } from 'recoil'
import useTilg from 'tilg'
import { useSnapshot } from 'valtio'

import { RenditionSpread } from '@flow/epubjs/types/rendition'
import { navbarState } from '@flow/reader/state'

import { db } from '../db'
import { handleFiles } from '../file'
import {
  hasSelection,
  useBackground,
  useColorScheme,
  useDisablePinchZooming,
  useForceRender,
  useMobile,
  useSync,
  useTranslation,
  useTypography,
} from '../hooks'
import { BookTab, reader, useReaderSnapshot } from '../models'
import { isTouchScreen } from '../platform'
import { updateCustomStyle } from '../styles'

import {
  getClickedAnnotation,
  setClickedAnnotation,
  Annotations,
} from './Annotation'
import { Tab } from './Tab'
import { TextSelectionMenu } from './TextSelectionMenu'
import { DropZone, SplitView, useDndContext, useSplitViewItem } from './base'
import * as pages from './pages'

import type { Rendition, Location, Book } from '@flow/epubjs'

class BaseTab {
  constructor(public readonly id: string, public readonly title = id) {}

  get isBook(): boolean {
    return this instanceof BookTab
  }

  get isPage(): boolean {
    return this instanceof PageTab
  }
}

type Group = {
  id: string
  index: number
  tabs: BookTab[]
}

type Tab = BookTab | PageTab
class PageTab extends BaseTab {
  constructor(public readonly Component: React.FC<any>) {
    super(Component.displayName ?? 'untitled')
  }
}
type GroupsArray = Group[]

function handleKeyDown(tab?: BookTab) {
  return (e: KeyboardEvent) => {
    try {
      switch (e.code) {
        case 'ArrowLeft':
        case 'ArrowUp':
          tab?.prev()
          break
        case 'ArrowRight':
        case 'ArrowDown':
          tab?.next()
          break
        case 'Space':
          e.shiftKey ? tab?.prev() : tab?.next()
      }
    } catch (error) {
      // ignore `rendition is undefined` error
    }
  }
}

export function ReaderGridView() {
  const { groups } = useReaderSnapshot()

  useEventListener('keydown', handleKeyDown(reader.focusedBookTab))

  if (!Array.isArray(groups) || !groups.length) return null
  return (
    <SplitView className={clsx('ReaderGridView')}>
      {groups.map(({ id }, i) => (
        <ReaderGroup key={id} index={i} />
      ))}
    </SplitView>
  )
}

interface ReaderGroupProps {
  index: number
}
/**
 * Renders a reader group.
 * 
 * @param index - The index of the group to render.
 * 
 * Renders the tabs, drop zones, and panes for a reader group. Handles tab selection, 
 * drag and drop, and deletion. Connects the group to the global reader state.
 */
function ReaderGroup({ index }: ReaderGroupProps) {
  const group = reader.groups[index]!
  const { focusedIndex } = useReaderSnapshot()
  const { tabs, selectedIndex } = useSnapshot(group)
  const t = useTranslation()

  const { size } = useSplitViewItem(`${ReaderGroup.name}.${index}`, {
    // to disable sash resize
    visible: false,
  })

  const handleMouseDown = useCallback(() => {
    reader.selectGroup(index)
  }, [index])

      return (
    <div
      className="ReaderGroup flex flex-1 flex-col overflow-hidden focus:outline-none"
      onMouseDown={handleMouseDown}
      style={{ width: size }}
    >
      <Tab.List
        className="hidden sm:flex"
        onDelete={() => reader.removeGroup(index)}
      >
        {tabs.map((tab: BaseTab, i) => {
          const selected = i === selectedIndex
          const focused = index === focusedIndex && selected
          return (
            <Tab
              key={tab.id}
              selected={selected}
              focused={focused}
              onClick={() => group.selectTab(i)}
              onDelete={() => reader.removeTab(i, index)}
              Icon={tab instanceof BookTab ? RiBookLine : MdWebAsset}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', `${index},${i}`)
              }}
            >
              {tab.isBook ? tab.title : t(`${tab.title}.title`)}
            </Tab>
          )
        })}
      </Tab.List>

      <DropZone
        className={clsx('flex-1', isTouchScreen || 'h-0')}
        split
        onDrop={async (e, position) => {
          // read `e.dataTransfer` first to avoid get empty value after `await`
          const files = e.dataTransfer.files
          let tabs = []

          if (files.length) {
            tabs = await handleFiles(files)
          } else {
            const text = e.dataTransfer.getData('text/plain')
            const fromTab = text.includes(',')

            if (fromTab) {
              const indexes = text.split(',')
              const groupIdx = Number(indexes[0])

              if (index === groupIdx) {
                if (group.tabs.length === 1) return
                if (position === 'universe') return
              }

              const tabIdx = Number(indexes[1])
              const tab = reader.removeTab(tabIdx, groupIdx)
              if (tab) tabs.push(tab)
            } else {
              const id = text
              const tabParam =
                Object.values(pages).find((p) => p.displayName === id) ??
                (await db?.books.get(id))
              if (tabParam) tabs.push(tabParam)
            }
          }

          if (tabs.length) {
            switch (position) {
              case 'left':
                reader.addGroup(tabs, index)
                break
              case 'right':
                reader.addGroup(tabs, index + 1)
                break
              default:
                tabs.forEach((t) => reader.addTab(t, index))
            }
          }
        }}
      >
        {group.tabs.map((tab, i) => (
          <PaneContainer active={i === selectedIndex} key={tab.id}>
            {tab instanceof BookTab ? (
              <BookPane tab={tab} onMouseDown={handleMouseDown} />
            ) : (
              <tab.Component />
            )}
          </PaneContainer>
        ))}
      </DropZone>
    </div>
  )
}

interface PaneContainerProps {
  active: boolean
}
const PaneContainer: React.FC<PaneContainerProps> = ({ active, children }) => {
  return <div className={clsx('h-full', active || 'hidden')}>{children}</div>
}

interface BookPaneProps {
  tab: BookTab
  onMouseDown: () => void
}


function BookPane({ tab, onMouseDown }: BookPaneProps) {
  const ref = useRef<HTMLDivElement>(null)
  const prevSize = useRef(0)
  const typography = useTypography(tab)
  const { dark } = useColorScheme()
  const [background] = useBackground()

  const { iframe, rendition, rendered, container } = useSnapshot(tab)

  useTilg()

  const originalParagraphs = useRef<string[]>([]); // Store original paragraphs

  function getParagraphIndex(element: HTMLElement) {
    let pTag = element;
    let index = 0;
  
    // Traverse up to find the nearest <p> ancestor
    while (pTag && pTag.tagName !== 'P') {
      pTag = pTag.parentNode as HTMLElement;
    }
  
    // Count preceding <p> siblings
    while (pTag && pTag.previousElementSibling) {
      if (pTag.previousElementSibling.tagName === 'P') {
        index++;
      }
      pTag = pTag.previousElementSibling as HTMLElement;
    }
  
    return index;
  }
  
  const paragraphObservers: MutationObserver[] = [];
  
  // Later, if you need to disconnect the observers, you can iterate through the stored observers and call disconnect
  function disconnectObservers() {
    paragraphObservers.forEach((observer) => observer.disconnect());
  }
  
  function cleanUpParagraph(p: HTMLElement) {
    if (originalParagraphs.current.length > 0) {
      console.log("Attempting to clean up extraneous Google Translate tag on paragraph ", p);
      if (!p) return;
  
      const dataIndex = p.getAttribute('data-index');
      let index = -1
      if (dataIndex === null || dataIndex === undefined) {
        console.log("no index found, trying counting")
        index = getParagraphIndex(p)
        if (index === null || index === undefined || index === -1) {
          console.log("failed that too, bailing")
          return
        }
      } else {
        index = Number(index);
      }
  
        const originalContent = originalParagraphs.current[index] as string;
        let currentContent = p.innerHTML;
  
        const parser = new DOMParser();
        const originalDoc = parser.parseFromString(originalContent, 'text/html');
        const currentDoc = parser.parseFromString(currentContent, 'text/html');
  
        // Function to recursively remove extra tags
        function removeExtraTags(originalNode: Node, currentNode: Node) {
          const originalChildren = Array.from(originalNode.childNodes);
          const currentChildren = Array.from(currentNode.childNodes);
          if (!iframe) {
            console.log("no iframe found")
            return
          }
    
          currentChildren.forEach((currentChild: ChildNode, idx) => {
            if (currentChild.nodeType === Node.ELEMENT_NODE) {
              // Check if the original child node exists and has the same node name.
              const originalChild = originalChildren[idx];
              if (!originalChild || originalChild.nodeName !== currentChild.nodeName) {
                // If the tag doesn't exist in the original, remove it
                let fragment = iframe.document.createDocumentFragment();
        // Move all children of the to-be-deleted node to the fragment
        while (currentChild.firstChild) {
          fragment.appendChild(currentChild.firstChild);
        }
        // Replace the to-be-deleted node with the fragment
        currentChild.parentNode?.replaceChild(fragment, currentChild);
                // currentNode.removeChild(currentChild);
              } else {
                // Recurse into the child nodes
                if (originalChild.nodeType === Node.ELEMENT_NODE) {
                  removeExtraTags(originalChild, currentChild);
                }
              }
            }
          });
        }
          
        // Start the cleaning process
        removeExtraTags(originalDoc.body, currentDoc.body);
  
        // Update the paragraph content
        p.innerHTML = currentDoc.body.innerHTML;
    }
  }

  function toggleParagraphContent(pTag: HTMLElement) {
    console.log("called toggleParagraph with ", pTag)
    const index = pTag.getAttribute('data-index');
    let indexNum = -1
    if (index === null || index === undefined) {
      console.log("no index found, trying counting")
      indexNum = getParagraphIndex(pTag)
      if (indexNum === null || indexNum === undefined || indexNum === -1) {
        console.log("failed that too, bailing")
        return;
      }
    } else {
      indexNum = Number(index);
    }
  
    const isTranslated = pTag.classList.contains('is-translated');
    const temp = pTag.innerHTML
    if (!pTag.classList.contains('notranslate')) {
      pTag.classList.add('notranslate');
    }
  
    // Toggle the content and the class
    if (isTranslated) {
      pTag.innerHTML = originalParagraphs.current[indexNum] ?? pTag.innerHTML
      pTag.classList.remove('is-translated');
      console.log("set paragraph to translated version")
    } else {
      pTag.innerHTML = originalParagraphs.current[indexNum] ?? pTag.innerHTML
      pTag.classList.add('is-translated');
      console.log("set paragraph to original text")
    }

    originalParagraphs.current[indexNum] = temp
  }
  
useEffect(() => {
  const document = tab.section?.document;
  if (!document) return;

  const paragraphs = document.querySelectorAll('p');
  paragraphs.forEach((p, index) => {
    originalParagraphs.current[index] = p.innerHTML;
    p.setAttribute('data-index', index.toString());
  });

    console.log("made paragraphs as originalParagraphs:", originalParagraphs)
  const observer = new MutationObserver((mutations) => {
    console.log(`Mutation observed in body`);
    mutations.forEach((mutation) => {
      // if mutation is a subtree, then see if it's a paragraph descendent
      console.log("mutation found ", mutation)
      if (mutation.type === 'childList') {
        const target = mutation.target as HTMLElement
        // if (mutation.removedNodes.length > 0 && target.nodeName === 'P') {
        //   cleanUpParagraph(target)
        // }
        if (mutation.removedNodes.length > 0 && target.nodeName === 'P' && !target.classList.contains('notranslate')) {
          // console.log("adding notranslate to paragraph: ", target)
          target.classList.add('notranslate');
        }
        mutation.addedNodes.forEach((node) => {
          // Check if the added node is an element node
          // console.log("node added found ", node)
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.nodeName === 'FONT') {
              let fragment = document.createDocumentFragment();
              // Move all children of the font node to the fragment
              while (node.firstChild) {
                fragment.appendChild(node.firstChild);
              }
              // Replace the font node with the fragment
              node.parentNode?.replaceChild(fragment, node);
              // console.log("removed added font node ", node, " with ", fragment)
            }
          }
        });
      }
    });
  });

  if (iframe) {
    console.log("trying with iframe ", iframe)
    observer.observe(iframe.document.body, { childList: true, subtree: true });
  }
  return () => {
    console.log("unmounting body observer")
      observer.disconnect()
  };
  }, [tab.section]);



  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new ResizeObserver(([e]) => {
      const size = e?.contentRect.width ?? 0
      // `display: hidden` will lead `rect` to 0
      if (size !== 0 && prevSize.current !== 0) {
        reader.resize()
      }
      prevSize.current = size
    })

    observer.observe(el)

    return () => {
      observer.disconnect()
    }
  }, [])

  useSync(tab)

  const setNavbar = useSetRecoilState(navbarState)
  const mobile = useMobile()

  const applyCustomStyle = useCallback(() => {
    const contents = rendition?.getContents()[0]
    console.log("applying custom style, contents = ", contents)
    if (contents === undefined) { return }
    contents.addStylesheet('https://fonts.googleapis.com/css?family=Merriweather|Literata|Bitter|Lora|Crimson+Text|Noticia+Text|Marcellus|Martel|Lato=swap');
    updateCustomStyle(contents, typography)
  }, [rendition, typography])

  useEffect(() => {
    console.log("updating font family to ", typography.fontFamily)
    if (typography?.fontFamily) {
    rendition?.themes.font(typography.fontFamily)
    }
  }, [typography.fontFamily])
  useEffect(() => {
    tab.onRender = applyCustomStyle
  }, [applyCustomStyle, tab])

  useEffect(() => {
    if (ref.current) tab.render(ref.current)
  }, [tab])

  useEffect(() => {
    /**
     * when `spread` changes, we should call `spread()` to re-layout,
     * then call {@link updateCustomStyle} to update custom style
     * according to the latest layout
     */
    rendition?.spread(typography.spread ?? RenditionSpread.Auto)
  }, [typography.spread, rendition])

  useEffect(() => applyCustomStyle(), [applyCustomStyle])

  useEffect(() => {
    if (dark === undefined) return
    // set `!important` when in dark mode
    rendition?.themes.override('color', dark ? '#bfc8ca' : '#3f484a', dark)
  }, [rendition, dark])

  const [src, setSrc] = useState<string>()

  useEffect(() => {
    if (src) {
      if (document.activeElement instanceof HTMLElement)
        document.activeElement?.blur()
    }
  }, [src])

  const { setDragEvent } = useDndContext()

  // `dragenter` not fired in iframe when the count of times is even, so use `dragover`
  useEventListener(iframe, 'dragover', (e: any) => {
    console.log('drag enter in iframe')
    setDragEvent(e)
  })

  // useEventListener(iframe, 'contextmenu', (e) => {
  //   e.preventDefault();
  // });
  
  // useEventListener(iframe, 'mousedown', onMouseDown)

  useEventListener(iframe, 'click', (e) => {
    // https://developer.chrome.com/blog/tap-to-search
    e.preventDefault()

    for (const el of e.composedPath() as any) {
      // `instanceof` may not work in iframe
      if (el.tagName === 'A' && el.href) {
        tab.showPrevLocation()
        return
      }
      if (mobile === false && el.tagName === 'IMG') {
        setSrc(el.src)
        return
      }
    }

    if (isTouchScreen && container) {
      if (getClickedAnnotation()) {
        setClickedAnnotation(false)
        return
      }

      const w = container.clientWidth
      const x = e.clientX % w
      const threshold = 0.15
      const side = w * threshold

      if (x < side) {
        tab.prev()
        return
      } else if (w - x < side) {
        tab.next()
        return
      }
    }

    let targetElement = e.target as HTMLElement;
    console.log("clicked touchscreen, e=", e)

    // Traverse up to find the nearest <p> ancestor
    while (targetElement && targetElement.tagName !== 'P') {
      targetElement = targetElement.parentNode as HTMLElement;
  
      // If we've reached the top of the document without finding a <p>, exit the loop
      if (!targetElement || targetElement === document.body) {
        break;
      }
    }
  
    // Check if we found a <p> element
    if (targetElement && targetElement.tagName === 'P') {
      toggleParagraphContent(targetElement);
      return;
    }

    if (isTouchScreen && container && mobile) {
        setNavbar((a) => !a)
    }
  })

  useEventListener(iframe, 'wheel', (e) => {
    if (e.deltaY < 0) {
      tab.prev()
    } else {
      tab.next()
    }
  })

  useEventListener(iframe, 'keydown', handleKeyDown(tab))

  useEventListener(iframe, 'touchstart', (e) => {
    const x0 = e.targetTouches[0]?.clientX ?? 0
    const y0 = e.targetTouches[0]?.clientY ?? 0
    const t0 = Date.now()

    if (!iframe) return

    // When selecting text with long tap, `touchend` is not fired,
    // so instead of use `addEventlistener`, we should use `on*`
    // to remove the previous listener.
    iframe.ontouchend = function handleTouchEnd(e: TouchEvent) {
      iframe.ontouchend = undefined
      const selection = iframe.getSelection()
      if (hasSelection(selection)) return

      const x1 = e.changedTouches[0]?.clientX ?? 0
      const y1 = e.changedTouches[0]?.clientY ?? 0
      const t1 = Date.now()

      const deltaX = x1 - x0
      const deltaY = y1 - y0
      const deltaT = t1 - t0

      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)

      if (absX < 20) return

      if (absY / absX > 2) {
        if (deltaT > 100 || absX < 40) {
          return
        }
      }

      if (deltaX > 0) {
        tab.prev()
      }

      if (deltaX < 0) {
        tab.next()
      }
    }
  })

  useDisablePinchZooming(iframe)


  return (
    <div className={clsx('flex h-full flex-col', mobile && 'py-[3vw]')}>
      <PhotoSlider
        images={[{ src, key: 0 }]}
        visible={!!src}
        onClose={() => setSrc(undefined)}
        maskOpacity={0.6}
        bannerVisible={false}
      />
      <ReaderPaneHeader tab={tab} />
      <div
        ref={ref}
        className={clsx('relative flex-1', isTouchScreen || 'h-0')}
        // `color-scheme: dark` will make iframe background white
        style={{ colorScheme: 'auto' }}
      >
        <div
          className={clsx(
            'absolute inset-0',
            // do not cover `sash`
            'z-20',
            rendered && 'hidden',
            background,
          )}
        />
        <TextSelectionMenu tab={tab} />
        <Annotations tab={tab} />
      </div>
      <ReaderPaneFooter tab={tab} />
    </div>
  )
}

interface ReaderPaneHeaderProps {
  tab: BookTab
}
const ReaderPaneHeader: React.FC<ReaderPaneHeaderProps> = ({ tab }) => {
  const { location } = useSnapshot(tab)
  const navPath = tab.getNavPath()

  useEffect(() => {
    navPath.forEach((i) => (i.expanded = true))
  }, [navPath])

  return (
    <Bar>
      <div className="scroll-h flex">
        {navPath.map((item, i) => (
          <button
            key={i}
            className="hover:text-on-surface flex shrink-0 items-center notranslate"
          >
            {item.label}
            {i !== navPath.length - 1 && <MdChevronRight size={20} />}
          </button>
        ))}
      </div>
      {location && (
        <div className="shrink-0 notranslate">
          {location.start.displayed.page + 1} / {location.start.displayed.total}
        </div>
      )}
    </Bar>
  )
}

interface FooterProps {
  tab: BookTab
}
const ReaderPaneFooter: React.FC<FooterProps> = ({ tab }) => {
  const { locationToReturn, location, book } = useSnapshot(tab)

  return (
    <Bar>
      {locationToReturn ? (
        <>
          <button
            className={clsx(locationToReturn || 'invisible')}
            onClick={() => {
              tab.hidePrevLocation()
              tab.display(locationToReturn.end.cfi, false)
            }}
          >
            Return to {locationToReturn.end.cfi}
          </button>
          <button
            onClick={() => {
              tab.hidePrevLocation()
            }}
          >
            Stay
          </button>
        </>
      ) : (
        <>
          <div className="notranslate">{location?.start.cfi}</div>
          <div className="notranslate">{((book.percentage ?? 0) * 100).toFixed(1)}%</div>
        </>
      )}
    </Bar>
  )
}

interface LineProps extends ComponentProps<'div'> {}
const Bar: React.FC<LineProps> = ({ className, ...props }) => {
  return (
    <div
      className={clsx(
        'typescale-body-small text-outline flex h-6 items-center justify-between gap-2 px-[4vw] sm:px-2',
        className,
      )}
      {...props}
    ></div>
  )
}
