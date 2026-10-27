'use client'

import { useRef, useState } from 'react'
import { getJson, getString } from '@/lib/sectionSettings'
import type { CodeSectionProps } from '../../../shared/contracts'
import { TemplateText } from '../../../shared/TemplateText'
import { optimizedImg } from '../../../shared/optimizedImage'

interface Video {
  video_id: string
  title: string
  duration?: string
  thumb_url?: string
}

// 'VIDEO_ID_' 로 시작하는 값은 샘플 → 저장된 썸네일 사용, 실제 ID 면 유튜브 썸네일
const isSample = (id: string) => !id || id.startsWith('VIDEO_ID_')
const thumbOf = (v: Video) =>
  isSample(v.video_id) ? (v.thumb_url ?? '') : `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`

/**
 * 유튜브 영상 — 대표 영상 + 목록 (목업 sections/video-playlist.html + video-playlist.js)
 * - 재생 버튼을 눌러야 iframe(youtube-nocookie)을 불러온다
 * - 목록을 누르면 대표 영상 자리로 교체 (JS 없으면 유튜브 페이지로 이동)
 * 설정 키: eyebrow · title · description (인라인 편집) · videos [{ video_id, title, duration, thumb_url }] · channel_url
 */
export function VideoPlaylist({ section, editable }: CodeSectionProps) {
  const videos = getJson<Video[]>(section.settings, 'videos', [])
  const channelUrl = getString(section.settings, 'channel_url')
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const playButtonRef = useRef<HTMLButtonElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  if (videos.length === 0) return null
  const video = videos[current] ?? videos[0]

  const select = (i: number) => {
    setCurrent(i)
    setPlaying(false)
    // 키보드 사용자를 위해 새 재생 버튼으로 포커스 이동
    requestAnimationFrame(() => playButtonRef.current?.focus())
  }
  const play = () => {
    setPlaying(true)
    requestAnimationFrame(() => iframeRef.current?.focus())
  }

  return (
    <section className="video-playlist" id="film" aria-labelledby="video-playlist-title">
      <div className="page-container video-playlist__inner">
        <header className="section-head video-playlist__head">
          <TemplateText section={section} editable={editable} field="eyebrow" as="p" className="section-head__eyebrow" lang="en" maxLength={40} />
          <TemplateText
            section={section}
            editable={editable}
            field="title"
            as="h2"
            id="video-playlist-title"
            className="section-head__title"
            multiline
            maxLength={80}
          />
          <TemplateText section={section} editable={editable} field="description" as="p" className="section-head__desc" maxLength={200} />
        </header>

        <div className="video-playlist__body">
          <div className="video-playlist__featured">
            <div className="video-playlist__player" data-video-id={video.video_id}>
              {playing ? (
                <iframe
                  ref={iframeRef}
                  className="video-playlist__iframe"
                  src={`https://www.youtube-nocookie.com/embed/${video.video_id}?autoplay=1&rel=0`}
                  title={video.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <button className="video-playlist__play" type="button" onClick={play} ref={playButtonRef}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- 목업 마크업 유지 (유튜브 썸네일은 그대로, 직접 올린 썸네일은 크기 변환) */}
                  <img
                    className="video-playlist__player-image"
                    {...optimizedImg(thumbOf(video), '(min-width: 1024px) 60vw, 100vw', 1200)}
                    alt=""
                    loading="lazy"
                  />
                  <span className="video-playlist__play-icon" aria-hidden="true">
                    <i className="ri-play-fill" />
                  </span>
                  <span className="sr-only">영상 재생:</span>
                  <span className="sr-only video-playlist__play-label">{video.title}</span>
                </button>
              )}
            </div>
          </div>

          <div className="video-playlist__sidebar">
            <ul className="video-playlist__list" aria-label="영상 목록">
              {videos.map((v, i) => (
                <li className="video-playlist__item" key={`${v.video_id}-${i}`}>
                  <a
                    className="video-playlist__link"
                    href={`https://www.youtube.com/watch?v=${v.video_id}`}
                    data-video-id={v.video_id}
                    aria-current={i === current ? 'true' : undefined}
                    onClick={(e) => {
                      e.preventDefault()
                      select(i)
                    }}
                  >
                    <span className="video-playlist__thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element -- 목업 마크업 유지 (썸네일 128px) */}
                      <img
                        className="video-playlist__thumb-image"
                        {...optimizedImg(thumbOf(v), '128px', 640)}
                        alt=""
                        loading="lazy"
                      />
                      {v.duration && (
                        <span className="video-playlist__duration">
                          <span className="sr-only">재생 시간</span>
                          {v.duration}
                        </span>
                      )}
                    </span>
                    <span className="video-playlist__title">{v.title}</span>
                  </a>
                </li>
              ))}
            </ul>
            {channelUrl && (
              <a
                className="btn btn--outline video-playlist__channel"
                href={channelUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="ri-youtube-fill" aria-hidden="true" />
                유튜브 채널 바로가기<span className="sr-only"> (새 창)</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
