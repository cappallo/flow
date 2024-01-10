import React, { useMemo, useState } from 'react'

import { Annotation } from '@flow/reader/annotation'
import { useTranslation } from '@flow/reader/hooks'
import { reader, useReaderSnapshot } from '@flow/reader/models'
import { group } from '@flow/reader/utils'

import { Row } from '../Row'
import { PaneViewProps, PaneView, Pane } from '../base'

export const AnnotationView: React.FC<PaneViewProps> = (props) => {
  return (
    <PaneView {...props}>
      <DefinitionPane />
      <AnnotationPane />
    </PaneView>
  )
}

const DefinitionPane: React.FC = () => {
  const { focusedBookTab } = useReaderSnapshot()
  const t = useTranslation('annotation')

  return (
    <Pane headline={t('definitions')} preferredSize={120}>
      {focusedBookTab?.book?.definitions.map((d) => {
        return (
          <Row
            key={d}
            onDelete={() => {
              reader.focusedBookTab?.undefine(d)
            }}
          >
            {d}
          </Row>
        )
      })}
    </Pane>
  )
}

interface GroupedAnnotations {
  [bookid: string]: {
    [spineIndex: string]: Annotation[];
  };
}

const AnnotationPane: React.FC = () => {
  const { focusedBookTab } = useReaderSnapshot();
  const t = useTranslation('annotation');

  const groupedByBook = useMemo(() => {
    const annotations = focusedBookTab?.book?.annotations ?? [];
    return annotations.reduce<GroupedAnnotations>((acc, annotation) => {
      if (!annotation.bookId || !annotation.spine || annotation.spine.index === undefined) {
        // Skip this annotation if it doesn't have the necessary properties
        return acc;
      }
  
      const bookId = annotation.bookId;
      const spineIndex = annotation.spine.index.toString(); // Ensure spine.index is a string
  
      // Initialize the nested structure if necessary
      acc[bookId] = acc[bookId] || {};
      acc[bookId]![spineIndex] = acc[bookId]![spineIndex] || [];

      // Now we can safely push the annotation with non-null assertion
      acc[bookId]![spineIndex]!.push(annotation);
  
      return acc;
    }, {});
  }, [focusedBookTab?.book?.annotations]);
  
  
  

  return (
    <Pane headline={t('annotations')}>
      {Object.entries(groupedByBook).map(([bookId, chapters]) => (
        <BookGroupBlock key={bookId} bookId={bookId} chapters={chapters} />
      ))}
    </Pane>
  );
};

interface BookGroupBlockProps {
  bookId: string;
  chapters: { [spineIndex: string]: Annotation[] };
}

const BookGroupBlock: React.FC<BookGroupBlockProps> = ({ bookId, chapters }) => {
  const [expanded, setExpanded] = useState(true);
  const t = useTranslation('annotation');

  return (
    <div>
      <Row depth={1} badge expanded={expanded} toggle={() => setExpanded(!expanded)}>
        {t('book')} ID: {bookId}
      </Row>
      {expanded && 
        Object.entries(chapters).map(([spineIndex, annotations]) => (
          <ChapterGroupBlock key={spineIndex} spineIndex={spineIndex} annotations={annotations} />
        ))
      }
    </div>
  );
};

interface ChapterGroupBlockProps {
  spineIndex: string;
  annotations: Annotation[];
}

const ChapterGroupBlock: React.FC<ChapterGroupBlockProps> = ({ spineIndex, annotations }) => {
  const [expanded, setExpanded] = useState(true);
  const spineTitle = annotations[0] && annotations[0].spine ? annotations[0].spine.title : `Chapter ${spineIndex}`;

  return (
    <div>
      <Row depth={2} badge expanded={expanded} toggle={() => setExpanded(!expanded)}>
        {spineTitle}
      </Row>
      {expanded && annotations.map((annotation) => (
        <AnnotationBlock key={annotation.id} annotation={annotation} />
      ))}
    </div>
  );
};

interface AnnotationBlockProps {
  annotation: Annotation;
}

const AnnotationBlock: React.FC<AnnotationBlockProps> = ({ annotation }) => {
  return (
    <div>
      <Row
        depth={3}
        onClick={() => reader.focusedBookTab?.display(annotation.cfi)}
        onDelete={() => reader.focusedBookTab?.removeAnnotation(annotation.cfi)}
      >
        {annotation.text}
      </Row>
      {annotation.notes && (
        <Row depth={4} onClick={() => reader.focusedBookTab?.display(annotation.cfi)}>
          <span className="text-outline">{annotation.notes}</span>
        </Row>
      )}
    </div>
  );
};